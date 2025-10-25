// ═══════════════════════════════════════════════════════════════
// OrtoSalon Dashboard - Supabase Edition
// ═══════════════════════════════════════════════════════════════

// Global variables
let currentUser = null;
let appData = {
    sales: [],
    expenses: [],
    employees: [],
    salaryPayments: [],
    suppliers: [],
    supplierPayments: [],
    purchases: [],
    auditLog: [],
    exchangeRate: 10.50 // 1 USD = X TJS - МОЖНО МЕНЯТЬ ЗДЕСЬ
};

// ═══════════════════════════════════════════════════════════════
// SUPABASE CONFIGURATION
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://jyhlrjrrmemttyvicibq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5aGxyanJybWVtdHR5dmljaWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzNjk2NjgsImV4cCI6MjA3Njk0NTY2OH0.XrkLM9jFmnnGQMkU2dxy286gzdYE43QdMzBj3Z4Ig7s';

// Инициализация Supabase клиента
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Sync management variables
let saveQueue = [];
let isSaving = false;
let lastSaveTime = 0;
let saveTimeout = null;
const SAVE_DEBOUNCE_DELAY = 2000; // 2 секунды задержки
const MIN_SAVE_INTERVAL = 1000; // Минимум 1 секунда между сохранениями
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Экспоненциальная задержка

// Admin accounts
const ADMIN_ACCOUNTS = {
    'Sunnat': { password: 'Sunna0909', displayName: 'Sunnat' },
    'Iskandar': { password: '1111', displayName: 'Iskandar' },
    'Shahida': { password: 's2364170', displayName: 'Shahida' }
};

// Salons
const SALONS = ['Ортосалон Муниса', 'Ортосалон Сиема', 'Ортосалон Баракат', 'Ортосалон Айни'];

// Countries
const COUNTRIES = {
    'TJ': { name: 'Таджикистан', flag: '🇹🇯' },
    'RU': { name: 'Россия', flag: '🇷🇺' },
    'TR': { name: 'Турция', flag: '🇹🇷' },
    'CN': { name: 'Китай', flag: '🇨🇳' }
};

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount) + ' TJS';
}

function formatCurrencyUSD(amount) {
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount) + ' $';
}

function convertTJStoUSD(amountTJS) {
    const rate = appData.exchangeRate || 10.50;
    return amountTJS / rate;
}

function convertUSDtoTJS(amountUSD) {
    const rate = appData.exchangeRate || 10.50;
    return amountUSD * rate;
}

async function updateExchangeRate(newRate) {
    if (!newRate || isNaN(newRate) || newRate <= 0) {
        alert('Пожалуйста, введите корректный курс обмена.');
        return;
    }

    const oldRate = appData.exchangeRate;
    appData.exchangeRate = newRate;

    // Пересчитать все USD значения
    appData.suppliers.forEach(supplier => {
        supplier.debtUSD = convertTJStoUSD(supplier.debt);
    });

    appData.purchases.forEach(purchase => {
        if (purchase.currency === 'TJS') {
            purchase.amountUSD = convertTJStoUSD(purchase.amount);
        } else {
            purchase.amount = convertUSDtoTJS(purchase.amountUSD);
        }
    });

    appData.supplierPayments.forEach(payment => {
        if (payment.currency === 'TJS') {
            payment.amountUSD = convertTJStoUSD(payment.amount);
        } else {
            payment.amount = convertUSDtoTJS(payment.amountUSD);
        }
    });

    await saveData();
    loadSuppliersTable();
    loadPurchasesTable();
    updateDebtSummary();
    alert(`Курс обмена обновлен:\n${oldRate.toFixed(2)} → ${newRate.toFixed(2)} TJS за $1\n\nВсе суммы пересчитаны.`);
}

function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('ru-RU');
}

function formatDateTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('ru-RU');
}

function generateId(prefix = 'id') {
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function showLoading(show = true) {
    document.getElementById('loadingIndicator').style.display = show ? 'block' : 'none';
}

function showError(message, containerId = 'loginError') {
    const errorElement = document.getElementById(containerId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }
}

function showSuccess(message, containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        const successElement = document.createElement('div');
        successElement.className = 'success-message';
        successElement.textContent = message;
        container.appendChild(successElement);
        setTimeout(() => {
            if (successElement.parentNode) {
                successElement.parentNode.removeChild(successElement);
            }
        }, 3000);
    }
}

// ═══════════════════════════════════════════════════════════════
// SUPABASE DATA FUNCTIONS
// ═══════════════════════════════════════════════════════════════

async function loadData() {
    showLoading(true);
    try {
        const { data, error } = await supabase
            .from('dashboard_data')
            .select('*')
            .order('id', { ascending: false })
            .limit(1);

        if (error) {
            console.error('Supabase error:', error);
            if (error.code === 'PGRST116') {
                console.log('No data found, using initial data');
                appData = {
                    sales: [],
                    expenses: [],
                    employees: [],
                    salaryPayments: [],
                    suppliers: [],
                    supplierPayments: [],
                    purchases: [],
                    auditLog: [],
                    exchangeRate: 10.50
                };
            } else {
                showError('Не удалось загрузить данные из Supabase');
                return;
            }
        } else if (data && data.length > 0 && data[0].app_json) {
            appData = JSON.parse(data[0].app_json);
            console.log('Data loaded from Supabase successfully');
        } else {
            appData = {
                sales: [],
                expenses: [],
                employees: [],
                salaryPayments: [],
                suppliers: [],
                supplierPayments: [],
                purchases: [],
                auditLog: [],
                exchangeRate: 10.50
            };
        }

        if (!appData.exchangeRate || appData.exchangeRate <= 0) {
            appData.exchangeRate = 10.50;
        }

        appData.suppliers = (appData.suppliers || []).map(supplier => ({
            ...supplier,
            debtUSD: supplier.debtUSD !== undefined ? supplier.debtUSD : convertTJStoUSD(supplier.debt || 0)
        }));

        appData.purchases = (appData.purchases || []).map(purchase => ({
            ...purchase,
            amountUSD: purchase.amountUSD !== undefined ? purchase.amountUSD : convertTJStoUSD(purchase.amount || 0),
            currency: purchase.currency || 'TJS'
        }));

        appData.supplierPayments = (appData.supplierPayments || []).map(payment => ({
            ...payment,
            amountUSD: payment.amountUSD !== undefined ? payment.amountUSD : convertTJStoUSD(payment.amount || 0),
            currency: payment.currency || 'TJS'
        }));

        appData.sales = appData.sales || [];
        appData.expenses = appData.expenses || [];
        appData.employees = appData.employees || [];
        appData.salaryPayments = appData.salaryPayments || [];
        appData.auditLog = appData.auditLog || [];

        console.log('✓ Data loaded successfully. Exchange rate:', appData.exchangeRate);
    } catch (error) {
        console.error('Error loading data:', error);
        showError('Ошибка при загрузке данных');
    } finally {
        showLoading(false);
    }
}

async function saveData() {
    return new Promise((resolve) => {
        saveQueue.push(resolve);
        processSaveQueue();
    });
}

function processSaveQueue() {
    if (isSaving) return;
    if (saveQueue.length === 0) return;
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        await executeSave();
    }, SAVE_DEBOUNCE_DELAY);
}

async function executeSave(retryCount = 0) {
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTime;

    if (timeSinceLastSave < MIN_SAVE_INTERVAL) {
        setTimeout(() => executeSave(retryCount), MIN_SAVE_INTERVAL - timeSinceLastSave);
        return;
    }

    isSaving = true;
    showSyncIndicator('syncing');

    try {
        const payload = {
            app_json: JSON.stringify(appData),
            updated_at: new Date().toISOString()
        };

        const { data: existingData, error: checkError } = await supabase
            .from('dashboard_data')
            .select('id')
            .order('id', { ascending: false })
            .limit(1);

        if (checkError && checkError.code !== 'PGRST116') {
            throw new Error('CHECK_ERROR: ' + checkError.message);
        }

        let result;
        if (existingData && existingData.length > 0) {
            result = await supabase
                .from('dashboard_data')
                .update(payload)
                .eq('id', existingData[0].id);
        } else {
            result = await supabase
                .from('dashboard_data')
                .insert([payload]);
        }

        if (result.error) {
            throw new Error('SAVE_ERROR: ' + result.error.message);
        }

        lastSaveTime = Date.now();
        isSaving = false;

        const queue = [...saveQueue];
        saveQueue = [];
        queue.forEach(resolve => resolve(true));

        showSyncIndicator('success');
        console.log('✓ Data saved successfully to Supabase');
        return true;

    } catch (error) {
        console.error('Save error:', error.message);

        const shouldRetry = (
            error.message.includes('SAVE_ERROR') ||
            error.message.includes('CHECK_ERROR') ||
            error.name === 'TypeError' ||
            error.name === 'NetworkError'
        );

        if (shouldRetry && retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAYS[retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
            console.log(`⟳ Retrying save in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
            showSyncIndicator('syncing', `Повторная попытка ${retryCount + 1}/${MAX_RETRIES}...`);
            isSaving = false;
            await new Promise(resolve => setTimeout(resolve, delay));
            return executeSave(retryCount + 1);
        }

        isSaving = false;
        const queue = [...saveQueue];
        saveQueue = [];
        queue.forEach(resolve => resolve(false));
        showSyncIndicator('error', 'Ошибка синхронизации');
        console.error('✗ Failed to save after', MAX_RETRIES, 'attempts');
        return false;
    }
}

function showSyncIndicator(status = 'syncing', message = '') {
    const indicator = document.getElementById('syncIndicator');
    if (!indicator) return;
    const icon = indicator.querySelector('.sync-icon');
    const text = indicator.querySelector('.sync-text');
    indicator.classList.remove('syncing', 'success', 'error');
    if (status === 'syncing') {
        indicator.classList.add('syncing');
        icon.textContent = '🔄';
        text.textContent = message || 'Сохранение...';
    } else if (status === 'success') {
        indicator.classList.add('success');
        icon.textContent = '✓';
        text.textContent = message || 'Сохранено';
    } else if (status === 'error') {
        indicator.classList.add('error');
        icon.textContent = '⚠';
        text.textContent = message || 'Ошибка синхронизации';
    }
    indicator.classList.add('visible');
    if (status !== 'error') {
        setTimeout(() => { indicator.classList.remove('visible'); }, 3000);
    } else {
        setTimeout(() => { indicator.classList.remove('visible'); }, 5000);
    }
}

// Audit log function
function addToAuditLog(action, entityType, details) {
    const logEntry = {
        id: generateId('audit'),
        timestamp: new Date().toISOString(),
        admin: currentUser,
        action: action,
        entityType: entityType,
        details: details
    };
    appData.auditLog.unshift(logEntry);
    
    if (appData.auditLog.length > 1000) {
        appData.auditLog = appData.auditLog.slice(0, 1000);
    }
}


// ═══════════════════════════════════════════════════════════════
// ФУНКЦИИ БЕКАПА ДАННЫХ
// ═══════════════════════════════════════════════════════════════

// Создать бекап всех данных и скачать как JSON файл
function createBackup() {
    try {
        // Создаем объект бекапа с метаданными
        const backupData = {
            metadata: {
                backupDate: new Date().toISOString(),
                backupVersion: '1.0',
                createdBy: currentUser,
                applicationName: 'OrtoSalon Dashboard'
            },
            data: {
                sales: appData.sales || [],
                expenses: appData.expenses || [],
                employees: appData.employees || [],
                salaryPayments: appData.salaryPayments || [],
                suppliers: appData.suppliers || [],
                supplierPayments: appData.supplierPayments || [],
                purchases: appData.purchases || [],
                auditLog: appData.auditLog || [],
                exchangeRate: appData.exchangeRate || 10.50
            },
            statistics: {
                totalSales: (appData.sales || []).length,
                totalExpenses: (appData.expenses || []).length,
                totalEmployees: (appData.employees || []).length,
                totalSuppliers: (appData.suppliers || []).length
            }
        };

        // Конвертируем в JSON с форматированием
        const jsonString = JSON.stringify(backupData, null, 2);

        // Создаем blob
        const blob = new Blob([jsonString], { type: 'application/json' });

        // Создаем имя файла с датой и временем
        const date = new Date();
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
        const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
        const fileName = `ortosalon_backup_${dateStr}_${timeStr}.json`;

        // Создаем ссылку для скачивания
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = fileName;

        // Добавляем в DOM, кликаем и удаляем
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Освобождаем URL
        URL.revokeObjectURL(downloadLink.href);

        // Добавляем запись в журнал аудита
        addToAuditLog('BACKUP_CREATED', 'SYSTEM', {
            fileName: fileName,
            recordsCount: {
                sales: backupData.data.sales.length,
                expenses: backupData.data.expenses.length,
                employees: backupData.data.employees.length,
                suppliers: backupData.data.suppliers.length
            }
        });

        alert(`✅ Бекап успешно создан!\n\nФайл: ${fileName}\n\nВсего записей:\n- Продажи: ${backupData.statistics.totalSales}\n- Расходы: ${backupData.statistics.totalExpenses}\n- Сотрудники: ${backupData.statistics.totalEmployees}\n- Поставщики: ${backupData.statistics.totalSuppliers}`);

        console.log('✓ Backup created successfully:', fileName);
        return true;
    } catch (error) {
        console.error('Error creating backup:', error);
        alert('❌ Ошибка при создании бекапа: ' + error.message);
        return false;
    }
}

// Восстановить данные из бекапа
function restoreFromBackup() {
    // Создаем input элемент для выбора файла
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';

    fileInput.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Проверяем тип файла
        if (!file.name.endsWith('.json')) {
            alert('❌ Пожалуйста, выберите JSON файл бекапа');
            return;
        }

        // Подтверждение от пользователя
        const confirmRestore = confirm(
            `⚠️ ВНИМАНИЕ!\n\nВы собираетесь восстановить данные из бекапа:\n"${file.name}"\n\nЭто действие заменит ВСЕ текущие данные!\n\nПродолжить?`
        );

        if (!confirmRestore) {
            return;
        }

        try {
            showLoading(true);

            // Читаем файл
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const backupData = JSON.parse(e.target.result);

                    // Проверяем структуру бекапа
                    if (!backupData.data) {
                        throw new Error('Неверная структура файла бекапа');
                    }

                    // Сохраняем текущие данные на случай отката
                    const previousData = { ...appData };

                    // Восстанавливаем данные
                    appData.sales = backupData.data.sales || [];
                    appData.expenses = backupData.data.expenses || [];
                    appData.employees = backupData.data.employees || [];
                    appData.salaryPayments = backupData.data.salaryPayments || [];
                    appData.suppliers = backupData.data.suppliers || [];
                    appData.supplierPayments = backupData.data.supplierPayments || [];
                    appData.purchases = backupData.data.purchases || [];
                    appData.auditLog = backupData.data.auditLog || [];
                    appData.exchangeRate = backupData.data.exchangeRate || 10.50;

                    // Сохраняем в JSONBin
                    const saveResult = await saveData();

                    if (saveResult !== false) {
                        // Добавляем запись в журнал аудита
                        addToAuditLog('BACKUP_RESTORED', 'SYSTEM', {
                            fileName: file.name,
                            backupDate: backupData.metadata?.backupDate || 'unknown',
                            restoredBy: currentUser
                        });

                        await saveData(); // Сохраняем запись аудита

                        alert(
                            `✅ Данные успешно восстановлены из бекапа!\n\nФайл: ${file.name}\nДата бекапа: ${backupData.metadata?.backupDate ? new Date(backupData.metadata.backupDate).toLocaleString('ru-RU') : 'неизвестна'}\n\nСтраница будет перезагружена.`
                        );

                        // Перезагружаем страницу для обновления всех данных
                        setTimeout(() => {
                            location.reload();
                        }, 1000);
                    } else {
                        // Откатываем изменения
                        appData = previousData;
                        throw new Error('Не удалось сохранить восстановленные данные');
                    }
                } catch (error) {
                    console.error('Error restoring backup:', error);
                    alert('❌ Ошибка при восстановлении бекапа: ' + error.message);
                } finally {
                    showLoading(false);
                }
            };

            reader.onerror = () => {
                alert('❌ Ошибка при чтении файла');
                showLoading(false);
            };

            reader.readAsText(file);
        } catch (error) {
            console.error('Error in restore process:', error);
            alert('❌ Ошибка: ' + error.message);
            showLoading(false);
        }
    };

    // Триггерим выбор файла
    fileInput.click();
}

// Автоматический бекап (можно вызывать периодически)
function autoBackup() {
    const lastBackup = localStorage.getItem('lastAutoBackup');
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах

    // Проверяем, прошло ли 24 часа с последнего автобекапа
    if (!lastBackup || (now - parseInt(lastBackup)) > oneDay) {
        console.log('Creating automatic backup...');
        createBackup();
        localStorage.setItem('lastAutoBackup', now.toString());
    }
}


// Authentication functions
function login(username, password) {
    const account = ADMIN_ACCOUNTS[username];
    if (account && account.password === password) {
        currentUser = account.displayName;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('currentUser').textContent = currentUser;
        
        loadData().then(() => {
            updateDashboard();
            loadAllTables();
	
	 // Обновить поле курса обмена если оно есть
            const exchangeRateInput = document.getElementById('exchangeRateInput');
            if (exchangeRateInput) {
                exchangeRateInput.value = appData.exchangeRate;
            }
        });
        return true;
    }
    return false;
}

function logout() {
    currentUser = null;
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
    document.getElementById('loginForm').reset();
}

// Navigation functions
function switchTab(tabName) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    document.getElementById(tabName + 'Section').classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    if (tabName === 'dashboard') {
        updateDashboard();
    } else if (tabName === 'suppliers') {
        updateDebtSummary();
        loadSuppliersTable();
        populateSupplierSelects();
        loadSupplierPaymentsHistory();
    } else if (tabName === 'salaries') {
        populateEmployeeSelect();
    }
}

function switchSectionTab(sectionName, tabName) {
    const section = document.getElementById(sectionName + 'Section');
    
    section.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    section.querySelectorAll('.section-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.getElementById(tabName + 'Tab').classList.add('active');
    section.querySelector(`[data-section="${tabName}"]`).classList.add('active');
}

// Dashboard functions
function updateDashboard() {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const todayRevenue = appData.sales
        .filter(sale => new Date(sale.date) >= startOfToday)
        .reduce((sum, sale) => sum + parseFloat(sale.amount), 0);

    const weekRevenue = appData.sales
        .filter(sale => new Date(sale.date) >= startOfWeek)
        .reduce((sum, sale) => sum + parseFloat(sale.amount), 0);

    const monthRevenue = appData.sales
        .filter(sale => new Date(sale.date) >= startOfMonth)
        .reduce((sum, sale) => sum + parseFloat(sale.amount), 0);

    const totalRevenue = appData.sales.reduce((sum, sale) => sum + parseFloat(sale.amount), 0);
    const netProfit = totalRevenue * 0.3;

    document.getElementById('todayRevenue').textContent = formatCurrency(todayRevenue);
    document.getElementById('weekRevenue').textContent = formatCurrency(weekRevenue);
    document.getElementById('monthRevenue').textContent = formatCurrency(monthRevenue);
    document.getElementById('netProfit').textContent = formatCurrency(netProfit);

    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const reportFromDate = document.getElementById('reportFromDate');
    const reportToDate = document.getElementById('reportToDate');
    
    if (reportFromDate) {
        reportFromDate.valueAsDate = firstDay;
    }
    if (reportToDate) {
        reportToDate.valueAsDate = today;
    }

    generateReport();
}

// Sales functions (остаются без изменений)
function handleFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            parseSalesData(jsonData);
        } catch (error) {
            console.error('Error parsing file:', error);
            alert('Ошибка при чтении файла. Убедитесь, что файл имеет правильный формат.');
        }
    };
    reader.readAsArrayBuffer(file);
}

function parseSalesData(data) {
    const salesData = [];
    let currentSalon = null;

    for (let i = 0; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const cell0 = String(row[0] || '').trim();

        if (cell0.includes('Ортосалон')) {
            currentSalon = cell0;
            continue;
        }

        const dateMatch = cell0.match(/\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}:\d{2}/);
        if (dateMatch && currentSalon && row[3] !== undefined && row[3] !== null && row[3] !== '') {
            const dateStr = dateMatch[0].split(' ')[0];
            const amount = parseFloat(row[3]);
            
            if (!isNaN(amount) && amount > 0) {
                salesData.push({
                    salon: currentSalon,
                    date: convertDateFormat(dateStr),
                    amount: amount
                });
            }
        }
    }

    if (salesData.length === 0) {
        alert('Не найдено данных для импорта. Проверьте формат файла.');
        return;
    }

    showPreview(salesData);
}

function convertDateFormat(dateStr) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateStr;
}

function showPreview(salesData) {
    const previewTable = document.querySelector('#previewTable tbody');
    previewTable.innerHTML = salesData.map(sale => `
        <tr>
            <td>${sale.salon}</td>
            <td>${formatDate(sale.date)}</td>
            <td>${formatCurrency(sale.amount)}</td>
        </tr>
    `).join('');

    document.getElementById('filePreview').style.display = 'block';
    document.getElementById('filePreview').scrollIntoView({ behavior: 'smooth' });
    
    window.parsedSalesData = salesData;
}

async function confirmImport() {
    if (!window.parsedSalesData || window.parsedSalesData.length === 0) {
        alert('Нет данных для импорта.');
        return;
    }

    showLoading(true);
    try {
        const timestamp = new Date().toISOString();
        window.parsedSalesData.forEach(saleData => {
            const sale = {
                id: generateId('sale'),
                salon: saleData.salon,
                date: saleData.date,
                amount: saleData.amount,
                addedBy: 'import',
                timestamp: timestamp
            };
            appData.sales.push(sale);
        });

        addToAuditLog('Добавлено', 'Продажа', `${window.parsedSalesData.length} продаж`);
        await saveData();

        document.getElementById('fileInput').value = '';
        document.getElementById('filePreview').style.display = 'none';
        window.parsedSalesData = null;

        loadAllSalesTable();
        updateDashboard();
        alert(`Импортировано ${window.parsedSalesData ? window.parsedSalesData.length : 0} продаж!`);
    } catch (error) {
        console.error('Error importing data:', error);
        alert('Ошибка при импорте данных.');
    } finally {
        showLoading(false);
    }
}

function cancelImport() {
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').style.display = 'none';
    window.parsedSalesData = null;
}

async function addSale(event) {
    event.preventDefault();

    const salon = document.getElementById('salonSelect').value;
    const date = document.getElementById('saleDate').value;
    const amount = parseFloat(document.getElementById('saleAmount').value);

    if (!salon || !date || isNaN(amount) || amount <= 0) {
        alert('Пожалуйста, заполните все поля корректно.');
        return;
    }

    const sale = {
        id: generateId('sale'),
        salon: salon,
        date: date,
        amount: amount,
        addedBy: currentUser,
        timestamp: new Date().toISOString()
    };

    appData.sales.push(sale);
    addToAuditLog('Добавлено', 'Продажа', `${salon} - ${formatCurrency(amount)}`);
    await saveData();

    document.getElementById('addSaleForm').reset();
    loadAllSalesTable();
    updateDashboard();
    alert('Продажа добавлена!');
}

function loadAllSalesTable() {
    const tbody = document.querySelector('#allSalesTable tbody');
    const sortedSales = appData.sales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    tbody.innerHTML = sortedSales.map(sale => `
        <tr>
            <td>${sale.id.slice(-8)}</td>
            <td>${sale.salon}</td>
            <td>${formatDate(sale.date)}</td>
            <td>${formatCurrency(sale.amount)}</td>
            <td>${sale.addedBy}</td>
            <td>${formatDateTime(sale.timestamp)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-danger btn-sm" onclick="deleteSale('${sale.id}')">Удалить</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function deleteSale(saleId) {
    if (!confirm('Вы уверены, что хотите удалить эту продажу?')) return;

    const saleIndex = appData.sales.findIndex(sale => sale.id === saleId);
    if (saleIndex === -1) {
        alert('Продажа не найдена.');
        return;
    }

    const sale = appData.sales[saleIndex];
    appData.sales.splice(saleIndex, 1);
    addToAuditLog('Удалено', 'Продажа', `${sale.salon} - ${formatCurrency(sale.amount)}`);
    await saveData();

    loadAllSalesTable();
    updateDashboard();
    alert('Продажа удалена.');
}

// Expenses functions (остаются без изменений)
async function addExpense(event) {
    event.preventDefault();

    const salon = document.getElementById('expenseSalon').value;
    const category = document.getElementById('expenseCategory').value;
    const customCategory = document.getElementById('customCategory').value;
    const name = document.getElementById('expenseName').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const date = document.getElementById('expenseDate').value;
    const description = document.getElementById('expenseDescription').value;

    const finalCategory = category === 'Другое' ? customCategory : category;

    if (!salon || !finalCategory || !name || !date || isNaN(amount) || amount <= 0) {
        alert('Пожалуйста, заполните все обязательные поля.');
        return;
    }

    const expense = {
        id: generateId('expense'),
        salon: salon,
        name: name,
        category: finalCategory,
        amount: amount,
        date: date,
        description: description,
        addedBy: currentUser,
        timestamp: new Date().toISOString()
    };

    appData.expenses.push(expense);
    addToAuditLog('Добавлено', 'Расход', `${salon} - ${name} - ${formatCurrency(amount)}`);
    await saveData();

    document.getElementById('addExpenseForm').reset();
    document.getElementById('customCategoryGroup').style.display = 'none';
    loadExpensesTable();
    updateDashboard();
    alert('Расход добавлен!');
}

function loadExpensesTable() {
    const tbody = document.querySelector('#expensesTable tbody');

    // Get filter values
    const filterSalon = document.getElementById('filterExpenseSalon')?.value || '';
    const filterCategory = document.getElementById('filterExpenseCategory')?.value || '';

    // Filter expenses
    let filteredExpenses = appData.expenses;

    if (filterSalon) {
        filteredExpenses = filteredExpenses.filter(expense => expense.salon === filterSalon);
    }

    if (filterCategory) {
        filteredExpenses = filteredExpenses.filter(expense => expense.category === filterCategory);
    }

    const sortedExpenses = filteredExpenses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    tbody.innerHTML = sortedExpenses.map(expense => `
        <tr>
            <td>${expense.id.slice(-8)}</td>
            <td>${expense.salon}</td>
            <td>${expense.name || '-'}</td>
            <td>${expense.category}</td>
            <td>${formatCurrency(expense.amount)}</td>
            <td>${expense.description || '-'}</td>
            <td>${formatDate(expense.date)}</td>
            <td>${expense.addedBy}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-danger btn-sm" onclick="deleteExpense('${expense.id}')">Удалить</button>
                </div>
            </td>
        </tr>
    `).join('');

    // Update summary cards
    updateExpensesSummary();
}

function updateExpensesSummary() {
    // Calculate expenses by salon
    const expensesBySalon = {
        'Ортосалон Муниса': 0,
        'Ортосалон Сиема': 0,
        'Ортосалон Баракат': 0,
        'Ортосалон Айни': 0,
        'Общие': 0
    };

    appData.expenses.forEach(expense => {
        if (expensesBySalon.hasOwnProperty(expense.salon)) {
            expensesBySalon[expense.salon] += parseFloat(expense.amount);
        }
    });

    const totalExpenses = Object.values(expensesBySalon).reduce((sum, amount) => sum + amount, 0);

    // Update UI
    document.getElementById('expenseMunisa').textContent = formatCurrency(expensesBySalon['Ортосалон Муниса']);
    document.getElementById('expenseSiema').textContent = formatCurrency(expensesBySalon['Ортосалон Сиема']);
    document.getElementById('expenseBarakat').textContent = formatCurrency(expensesBySalon['Ортосалон Баракат']);
    document.getElementById('expenseAini').textContent = formatCurrency(expensesBySalon['Ортосалон Айни']);
    document.getElementById('expenseObshie').textContent = formatCurrency(expensesBySalon['Общие']);
    document.getElementById('expenseTotal').textContent = formatCurrency(totalExpenses);
}

async function deleteExpense(expenseId) {
    if (!confirm('Вы уверены, что хотите удалить этот расход?')) return;

    const expenseIndex = appData.expenses.findIndex(expense => expense.id === expenseId);
    if (expenseIndex === -1) {
        alert('Расход не найден.');
        return;
    }

    const expense = appData.expenses[expenseIndex];
    appData.expenses.splice(expenseIndex, 1);
    addToAuditLog('Удалено', 'Расход', `${expense.category} - ${formatCurrency(expense.amount)}`);
    await saveData();

    loadExpensesTable();
    alert('Расход удалён.');
}

// Employee functions (остаются без изменений)
function showAddEmployeeModal() {
    document.getElementById('employeeForm').reset();
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('addEmployeeModal').style.display = 'block';
}

async function saveEmployee() {
    const name = document.getElementById('employeeName').value;
    const position = document.getElementById('employeePosition').value;
    const salary = parseFloat(document.getElementById('employeeSalary').value);
    const commission = parseFloat(document.getElementById('employeeCommission').value);

    if (!name || !position || isNaN(salary) || isNaN(commission) || salary < 0 || commission < 0 || commission > 100) {
        alert('Пожалуйста, заполните все поля корректно.');
        return;
    }

    const employee = {
        id: generateId('employee'),
        name: name,
        position: position,
        salary: salary,
        commission: commission,
        addedBy: currentUser,
        timestamp: new Date().toISOString()
    };

    appData.employees.push(employee);
    addToAuditLog('Добавлено', 'Сотрудник', `${name} - ${position}`);
    await saveData();

    hideModal();
    loadEmployeesTable();
    populateEmployeeSelect();
    alert('Сотрудник добавлен!');
}

function loadEmployeesTable() {
    const tbody = document.querySelector('#employeesTable tbody');
    tbody.innerHTML = appData.employees.map(employee => `
        <tr>
            <td>${employee.id.slice(-8)}</td>
            <td>${employee.name}</td>
            <td>${employee.position}</td>
            <td>${formatCurrency(employee.salary)}</td>
            <td>${employee.commission}%</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-danger btn-sm" onclick="deleteEmployee('${employee.id}')">Удалить</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function populateEmployeeSelect() {
    const select = document.getElementById('employeeSelect');
    const currentValue = select.value;

    select.innerHTML = '<option value="">Выберите сотрудника</option>' +
        appData.employees.map(employee => 
            `<option value="${employee.id}">${employee.name} - ${employee.position}</option>`
        ).join('');

    if (currentValue) select.value = currentValue;
}

async function deleteEmployee(employeeId) {
    if (!confirm('Вы уверены, что хотите удалить этого сотрудника?')) return;

    const employeeIndex = appData.employees.findIndex(employee => employee.id === employeeId);
    if (employeeIndex === -1) {
        alert('Сотрудник не найден.');
        return;
    }

    const employee = appData.employees[employeeIndex];
    appData.employees.splice(employeeIndex, 1);
    addToAuditLog('Удалено', 'Сотрудник', `${employee.name} - ${employee.position}`);
    await saveData();

    loadEmployeesTable();
    populateEmployeeSelect();
    alert('Сотрудник удалён.');
}

// Salary payment functions (остаются без изменений)
async function addSalaryPayment(event) {
    event.preventDefault();

    const employeeId = document.getElementById('employeeSelect').value;
    const paymentType = document.getElementById('paymentType').value;
    const amount = parseFloat(document.getElementById('paymentAmount').value);
    const date = document.getElementById('paymentDate').value;

    if (!employeeId || !paymentType || !date || isNaN(amount) || amount <= 0) {
        alert('Пожалуйста, заполните все поля корректно.');
        return;
    }

    const employee = appData.employees.find(emp => emp.id === employeeId);
    if (!employee) {
        alert('Сотрудник не найден.');
        return;
    }

    const payment = {
        id: generateId('salary'),
        employeeId: employeeId,
        employeeName: employee.name,
        type: paymentType,
        typeLabel: paymentType === 'base' ? 'Оклад (15-е)' : 'Процент (31-е)',
        amount: amount,
        date: date,
        addedBy: currentUser,
        timestamp: new Date().toISOString()
    };

    appData.salaryPayments.push(payment);
    addToAuditLog('Добавлено', 'Выплата зарплаты', `${employee.name} - ${payment.typeLabel} - ${formatCurrency(amount)}`);
    await saveData();

    document.getElementById('addSalaryPaymentForm').reset();
    loadSalaryPaymentsTable();
    alert('Выплата добавлена!');
}

function loadSalaryPaymentsTable() {
    const tbody = document.querySelector('#salaryPaymentsTable tbody');
    const sortedPayments = appData.salaryPayments.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    tbody.innerHTML = sortedPayments.map(payment => `
        <tr>
            <td>${payment.id.slice(-8)}</td>
            <td>${payment.employeeName}</td>
            <td>${payment.typeLabel}</td>
            <td>${formatCurrency(payment.amount)}</td>
            <td>${formatDate(payment.date)}</td>
            <td>${payment.addedBy}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-danger btn-sm" onclick="deleteSalaryPayment('${payment.id}')">Удалить</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function deleteSalaryPayment(paymentId) {
    if (!confirm('Вы уверены, что хотите удалить эту выплату?')) return;

    const paymentIndex = appData.salaryPayments.findIndex(payment => payment.id === paymentId);
    if (paymentIndex === -1) {
        alert('Выплата не найдена.');
        return;
    }

    const payment = appData.salaryPayments[paymentIndex];
    appData.salaryPayments.splice(paymentIndex, 1);
    addToAuditLog('Удалено', 'Выплата зарплаты', `${payment.employeeName} - ${payment.typeLabel} - ${formatCurrency(payment.amount)}`);
    await saveData();

    loadSalaryPaymentsTable();
    alert('Выплата удалена.');
}

// Supplier functions - ОБНОВЛЕНО ДЛЯ ПОДДЕРЖКИ USD
function showAddSupplierModal() {
    document.getElementById('supplierForm').reset();
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('addSupplierModal').style.display = 'block';
}

async function saveSupplier() {
    const name = document.getElementById('supplierName').value;
    const country = document.getElementById('supplierCountry').value;
    const initialDebtTJS = parseFloat(document.getElementById('supplierInitialDebt').value);

    if (!name || !country || isNaN(initialDebtTJS) || initialDebtTJS < 0) {
        alert('Пожалуйста, заполните все поля корректно.');
        return;
    }

    const supplier = {
        id: generateId('supplier'),
        name: name,
        country: country,
        debt: initialDebtTJS,
        debtUSD: convertTJStoUSD(initialDebtTJS),
        addedBy: currentUser,
        timestamp: new Date().toISOString()
    };

    appData.suppliers.push(supplier);
    addToAuditLog('Добавлено', 'Поставщик', `${name} (${COUNTRIES[country].name}) - ${formatCurrency(initialDebtTJS)}`);
    await saveData();

    hideModal();
    loadSuppliersTable();
    populateSupplierSelects();
    updateDebtSummary();
    alert('Поставщик добавлен!');
}

function loadSuppliersTable() {
    const tbody = document.querySelector('#suppliersTable tbody');
    tbody.innerHTML = appData.suppliers.map(supplier => `
        <tr>
            <td>${supplier.id.slice(-8)}</td>
            <td>${supplier.name}</td>
            <td>${COUNTRIES[supplier.country].flag} ${COUNTRIES[supplier.country].name}</td>
            <td>
                <div>${formatCurrency(supplier.debt)}</div>
                <div style="font-size: 0.85em; color: #666;">${formatCurrencyUSD(supplier.debtUSD || 0)}</div>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-primary btn-sm" onclick="showSupplierPaymentModal('${supplier.id}')">Выплата</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteSupplier('${supplier.id}')">Удалить</button>
                </div>
            </td>
        </tr>
    `).join('');
}

function updateDebtSummary() {
    const debtByCountry = {};
    const debtByCountryUSD = {};
    let totalDebt = 0;
    let totalDebtUSD = 0;

    Object.keys(COUNTRIES).forEach(countryCode => {
        debtByCountry[countryCode] = 0;
        debtByCountryUSD[countryCode] = 0;
    });

    appData.suppliers.forEach(supplier => {
        debtByCountry[supplier.country] += supplier.debt;
        debtByCountryUSD[supplier.country] += (supplier.debtUSD || 0);
        totalDebt += supplier.debt;
        totalDebtUSD += (supplier.debtUSD || 0);
    });

    document.getElementById('debtTJ').innerHTML = `${formatCurrency(debtByCountry.TJ)}<br><span style="font-size: 0.85em; opacity: 0.7;">${formatCurrencyUSD(debtByCountryUSD.TJ)}</span>`;
    document.getElementById('debtRU').innerHTML = `${formatCurrency(debtByCountry.RU)}<br><span style="font-size: 0.85em; opacity: 0.7;">${formatCurrencyUSD(debtByCountryUSD.RU)}</span>`;
    document.getElementById('debtTR').innerHTML = `${formatCurrency(debtByCountry.TR)}<br><span style="font-size: 0.85em; opacity: 0.7;">${formatCurrencyUSD(debtByCountryUSD.TR)}</span>`;
    document.getElementById('debtCN').innerHTML = `${formatCurrency(debtByCountry.CN)}<br><span style="font-size: 0.85em; opacity: 0.7;">${formatCurrencyUSD(debtByCountryUSD.CN)}</span>`;
    document.getElementById('totalDebt').innerHTML = `${formatCurrency(totalDebt)}<br><span style="font-size: 0.85em; opacity: 0.7;">${formatCurrencyUSD(totalDebtUSD)}</span>`;
}

function populateSupplierSelects() {
    const select = document.getElementById('supplierSelect');
    const currentValue = select.value;

    select.innerHTML = '<option value="">Выберите поставщика</option>' +
        appData.suppliers.map(supplier => 
            `<option value="${supplier.id}">${supplier.name} (${COUNTRIES[supplier.country].flag})</option>`
        ).join('');

    if (currentValue) select.value = currentValue;
}

function showSupplierPaymentModal(supplierId) {
    const supplier = appData.suppliers.find(s => s.id === supplierId);
    if (!supplier) {
        alert('Поставщик не найден.');
        return;
    }

    document.getElementById('paymentSupplierName').textContent = supplier.name;
    document.getElementById('paymentCurrentDebt').innerHTML = `${formatCurrency(supplier.debt)}<br><span style="font-size: 0.9em; opacity: 0.8;">${formatCurrencyUSD(supplier.debtUSD || 0)}</span>`;
    document.getElementById('supplierPaymentForm').reset();
    document.getElementById('supplierPaymentDate').value = new Date().toISOString().split('T')[0];

    document.getElementById('supplierPaymentModal').dataset.supplierId = supplierId;
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('supplierPaymentModal').style.display = 'block';
}

async function confirmSupplierPayment() {
    const supplierId = document.getElementById('supplierPaymentModal').dataset.supplierId;
    const amount = parseFloat(document.getElementById('supplierPaymentAmount').value);
    const date = document.getElementById('supplierPaymentDate').value;
    const currency = document.getElementById('supplierPaymentCurrency').value;
    const commission = parseFloat(document.getElementById('supplierPaymentCommission').value) || 0;
    const paymentMethod = document.getElementById('supplierPaymentMethod').value;

    if (!amount || isNaN(amount) || amount <= 0 || !date || !paymentMethod) {
        alert('Пожалуйста, заполните все обязательные поля корректно.');
        return;
    }

    const supplier = appData.suppliers.find(s => s.id === supplierId);
    if (!supplier) {
        alert('Поставщик не найден.');
        return;
    }

    let amountTJS, amountUSD;

    if (currency === 'TJS') {
        amountTJS = amount;
        amountUSD = convertTJStoUSD(amount);
    } else {
        amountUSD = amount;
        amountTJS = convertUSDtoTJS(amount);
    }

    if (amountTJS > supplier.debt) {
        alert(`Сумма выплаты (${formatCurrency(amountTJS)}) превышает текущий долг (${formatCurrency(supplier.debt)}).`);
        return;
    }

    const payment = {
        id: generateId('supplierpayment'),
        supplierId: supplierId,
        supplierName: supplier.name,
        amount: amountTJS,
        amountUSD: amountUSD,
        currency: currency,
        commission: commission,
        paymentMethod: paymentMethod,
        date: date,
        addedBy: currentUser,
        timestamp: new Date().toISOString()
    };

    appData.supplierPayments.push(payment);
    supplier.debt -= amountTJS;
    supplier.debtUSD -= amountUSD;

    addToAuditLog('Добавлено', 'Выплата поставщику', `${supplier.name} - ${formatCurrency(amountTJS)} / ${formatCurrencyUSD(amountUSD)} (${paymentMethod})`);
    await saveData();

    hideModal();
    loadSuppliersTable();
    loadSupplierPaymentsHistory();
    updateDebtSummary();
    alert('Выплата добавлена!');
}
async function deleteSupplier(supplierId) {
    if (!confirm('Вы уверены, что хотите удалить этого поставщика?')) return;

    const supplierIndex = appData.suppliers.findIndex(supplier => supplier.id === supplierId);
    if (supplierIndex === -1) {
        alert('Поставщик не найден.');
        return;
    }

    const supplier = appData.suppliers[supplierIndex];
    appData.suppliers.splice(supplierIndex, 1);
    
    appData.supplierPayments = appData.supplierPayments.filter(payment => payment.supplierId !== supplierId);
    appData.purchases = appData.purchases.filter(purchase => purchase.supplierId !== supplierId);

    addToAuditLog('Удалено', 'Поставщик', supplier.name);
    await saveData();

    loadSuppliersTable();
    populateSupplierSelects();
    updateDebtSummary();
    alert('Поставщик удалён.');
}


// Supplier payment history functions
function loadSupplierPaymentsHistory(filterFromDate = null, filterToDate = null) {
    const tbody = document.querySelector('#supplierPaymentsHistoryTable tbody');

    let payments = [...appData.supplierPayments];

    // Apply date filtering
    if (filterFromDate || filterToDate) {
        payments = payments.filter(payment => {
            const paymentDate = new Date(payment.date);
            const fromDate = filterFromDate ? new Date(filterFromDate) : null;
            const toDate = filterToDate ? new Date(filterToDate) : null;

            if (fromDate && paymentDate < fromDate) return false;
            if (toDate && paymentDate > toDate) return false;
            return true;
        });
    }

    // Sort by date descending (most recent first)
    payments.sort((a, b) => new Date(b.date) - new Date(a.date));

    tbody.innerHTML = payments.map(payment => {
        const displayAmount = payment.currency === 'USD' 
            ? `${formatCurrencyUSD(payment.amountUSD || payment.amount)}`
            : `${formatCurrency(payment.amount)}`;
        const displayCommission = payment.commission 
            ? (payment.currency === 'USD' ? formatCurrencyUSD(payment.commission) : formatCurrency(payment.commission))
            : '0';

        return `
            <tr>
                <td>${payment.id.slice(-8)}</td>
                <td>${formatDate(payment.date)}</td>
                <td>${payment.supplierName}</td>
                <td>${displayAmount}</td>
                <td>${displayCommission}</td>
                <td>${payment.paymentMethod || '—'}</td>
                <td>${payment.addedBy}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-sm btn-secondary" onclick="showEditPaymentModal('${payment.id}')">Редактировать</button>
                        <button class="btn btn-sm btn-danger" onclick="deleteSupplierPayment('${payment.id}')">Удалить</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #999;">Нет выплат для отображения</td></tr>';
    }
}

function showEditPaymentModal(paymentId) {
    const payment = appData.supplierPayments.find(p => p.id === paymentId);
    if (!payment) {
        alert('Выплата не найдена.');
        return;
    }

    // Fill the form with current payment data
    document.getElementById('editPaymentAmount').value = payment.currency === 'USD' ? payment.amountUSD : payment.amount;
    document.getElementById('editPaymentCurrency').value = payment.currency || 'TJS';
    document.getElementById('editPaymentCommission').value = payment.commission || 0;
    document.getElementById('editPaymentMethod').value = payment.paymentMethod || '';
    document.getElementById('editPaymentDate').value = payment.date;

    // Store the payment ID in the modal
    document.getElementById('editPaymentModal').dataset.paymentId = paymentId;

    // Show the modal
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('editPaymentModal').style.display = 'block';
}

async function confirmEditPayment() {
    const paymentId = document.getElementById('editPaymentModal').dataset.paymentId;
    const payment = appData.supplierPayments.find(p => p.id === paymentId);

    if (!payment) {
        alert('Выплата не найдена.');
        return;
    }

    const newAmount = parseFloat(document.getElementById('editPaymentAmount').value);
    const newCurrency = document.getElementById('editPaymentCurrency').value;
    const newCommission = parseFloat(document.getElementById('editPaymentCommission').value) || 0;
    const newPaymentMethod = document.getElementById('editPaymentMethod').value;
    const newDate = document.getElementById('editPaymentDate').value;

    if (!newAmount || isNaN(newAmount) || newAmount <= 0 || !newPaymentMethod || !newDate) {
        alert('Пожалуйста, заполните все обязательные поля корректно.');
        return;
    }

    // Get the supplier
    const supplier = appData.suppliers.find(s => s.id === payment.supplierId);
    if (!supplier) {
        alert('Поставщик не найден.');
        return;
    }

    // Restore old amount to supplier debt
    supplier.debt += payment.amount;
    supplier.debtUSD += payment.amountUSD;

    // Calculate new amounts
    let newAmountTJS, newAmountUSD;
    if (newCurrency === 'TJS') {
        newAmountTJS = newAmount;
        newAmountUSD = convertTJStoUSD(newAmount);
    } else {
        newAmountUSD = newAmount;
        newAmountTJS = convertUSDtoTJS(newAmount);
    }

    // Update payment object
    payment.amount = newAmountTJS;
    payment.amountUSD = newAmountUSD;
    payment.currency = newCurrency;
    payment.commission = newCommission;
    payment.paymentMethod = newPaymentMethod;
    payment.date = newDate;

    // Subtract new amount from supplier debt
    supplier.debt -= newAmountTJS;
    supplier.debtUSD -= newAmountUSD;

    addToAuditLog('Изменено', 'Выплата поставщику', `${supplier.name} - ${formatCurrency(newAmountTJS)} / ${formatCurrencyUSD(newAmountUSD)}`);
    await saveData();

    hideModal();
    loadSuppliersTable();
    loadSupplierPaymentsHistory();
    updateDebtSummary();
    alert('Выплата обновлена!');
}

async function deleteSupplierPayment(paymentId) {
    if (!confirm('Вы уверены, что хотите удалить эту выплату?')) {
        return;
    }

    const paymentIndex = appData.supplierPayments.findIndex(p => p.id === paymentId);
    if (paymentIndex === -1) {
        alert('Выплата не найдена.');
        return;
    }

    const payment = appData.supplierPayments[paymentIndex];
    const supplier = appData.suppliers.find(s => s.id === payment.supplierId);

    if (supplier) {
        // Restore the debt
        supplier.debt += payment.amount;
        supplier.debtUSD += (payment.amountUSD || 0);
    }

    appData.supplierPayments.splice(paymentIndex, 1);

    addToAuditLog('Удалено', 'Выплата поставщику', `${payment.supplierName} - ${formatCurrency(payment.amount)}`);
    await saveData();

    loadSuppliersTable();
    loadSupplierPaymentsHistory();
    updateDebtSummary();
    alert('Выплата удалена!');
}

// Purchase functions - ОБНОВЛЕНО ДЛЯ ПОДДЕРЖКИ USD
async function addPurchase(event) {
    event.preventDefault();

    const supplierId = document.getElementById('supplierSelect').value;
    const amount = parseFloat(document.getElementById('purchaseAmount').value);
    const date = document.getElementById('purchaseDate').value;
    const description = document.getElementById('purchaseDescription').value;
    const currency = document.getElementById('purchaseCurrency').value;

    if (!supplierId || !date || !description || isNaN(amount) || amount <= 0) {
        alert('Пожалуйста, заполните все поля корректно.');
        return;
    }

    const supplier = appData.suppliers.find(s => s.id === supplierId);
    if (!supplier) {
        alert('Поставщик не найден.');
        return;
    }

    let amountTJS, amountUSD;
    
    if (currency === 'TJS') {
        amountTJS = amount;
        amountUSD = convertTJStoUSD(amount);
    } else {
        amountUSD = amount;
        amountTJS = convertUSDtoTJS(amount);
    }

    const purchase = {
        id: generateId('purchase'),
        supplierId: supplierId,
        supplierName: supplier.name,
        amount: amountTJS,
        amountUSD: amountUSD,
        currency: currency,
        date: date,
        description: description,
        addedBy: currentUser,
        timestamp: new Date().toISOString()
    };

    appData.purchases.push(purchase);
    supplier.debt += amountTJS;
    supplier.debtUSD += amountUSD;

    addToAuditLog('Добавлено', 'Закупка', `${supplier.name} - ${formatCurrency(amountTJS)} / ${formatCurrencyUSD(amountUSD)} - ${description}`);
    await saveData();

    document.getElementById('addPurchaseForm').reset();
    loadPurchasesTable();
    loadSuppliersTable();
    updateDebtSummary();
    alert('Закупка добавлена!');
}

function loadPurchasesTable() {
    const tbody = document.querySelector('#purchasesTable tbody');
    const sortedPurchases = appData.purchases.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    tbody.innerHTML = sortedPurchases.map(purchase => `
        <tr>
            <td>${purchase.id.slice(-8)}</td>
            <td>${purchase.supplierName}</td>
            <td>
                <div>${formatCurrency(purchase.amount)}</div>
                <div style="font-size: 0.85em; color: #666;">${formatCurrencyUSD(purchase.amountUSD || 0)}</div>
            </td>
            <td>${purchase.description}</td>
            <td>${formatDate(purchase.date)}</td>
            <td>${purchase.addedBy}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-danger btn-sm" onclick="deletePurchase('${purchase.id}')">Удалить</button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function deletePurchase(purchaseId) {
    if (!confirm('Вы уверены, что хотите удалить эту закупку?')) return;

    const purchaseIndex = appData.purchases.findIndex(purchase => purchase.id === purchaseId);
    if (purchaseIndex === -1) {
        alert('Закупка не найдена.');
        return;
    }

    const purchase = appData.purchases[purchaseIndex];
    appData.purchases.splice(purchaseIndex, 1);

    const supplier = appData.suppliers.find(s => s.id === purchase.supplierId);
    if (supplier) {
        supplier.debt -= purchase.amount;
        supplier.debtUSD -= (purchase.amountUSD || 0);
    }

    addToAuditLog('Удалено', 'Закупка', `${purchase.supplierName} - ${formatCurrency(purchase.amount)}`);
    await saveData();

    loadPurchasesTable();
    loadSuppliersTable();
    updateDebtSummary();
    alert('Закупка удалена.');
}

// Reports functions
function generateReport() {
    const fromDate = document.getElementById('reportFromDate').value;
    const toDate = document.getElementById('reportToDate').value;

    if (!fromDate || !toDate) {
        alert('Пожалуйста, выберите период отчета.');
        return;
    }

    if (new Date(fromDate) > new Date(toDate)) {
        alert('Начальная дата не может быть больше конечной даты.');
        return;
    }

    const fromDateTime = new Date(fromDate);
    const toDateTime = new Date(toDate);
    toDateTime.setHours(23, 59, 59, 999);

    const periodSales = appData.sales.filter(sale => {
        const saleDate = new Date(sale.date);
        return saleDate >= fromDateTime && saleDate <= toDateTime;
    });

    const periodExpenses = appData.expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= fromDateTime && expenseDate <= toDateTime;
    });

    const periodPurchases = appData.purchases.filter(purchase => {
        const purchaseDate = new Date(purchase.date);
        return purchaseDate >= fromDateTime && purchaseDate <= toDateTime;
    });

    const periodSupplierPayments = appData.supplierPayments.filter(payment => {
        const paymentDate = new Date(payment.date);
        return paymentDate >= fromDateTime && paymentDate <= toDateTime;
    });

    const periodSalaryPayments = appData.salaryPayments.filter(payment => {
        const paymentDate = new Date(payment.date);
        return paymentDate >= fromDateTime && paymentDate <= toDateTime;
    });

    const totalRevenue = periodSales.reduce((sum, sale) => sum + parseFloat(sale.amount), 0);
    const totalExpenses = periodExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    const totalProfit = totalRevenue * 0.3;
    const totalPurchases = periodPurchases.reduce((sum, purchase) => sum + parseFloat(purchase.amount), 0);
    const totalSupplierPayments = periodSupplierPayments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
    const totalSalaryPayments = periodSalaryPayments.reduce((sum, payment) => sum + parseFloat(payment.amount), 0);
    const balance = totalProfit - totalExpenses - totalPurchases - totalSupplierPayments - totalSalaryPayments;

    const salesCount = periodSales.length;
    const avgCheck = salesCount > 0 ? totalRevenue / salesCount : 0;
    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';

    const salesBySalon = {};
    SALONS.forEach(salon => {
        salesBySalon[salon] = periodSales
            .filter(sale => sale.salon === salon)
            .reduce((sum, sale) => sum + parseFloat(sale.amount), 0);
    });

    let bestSalon = '-';
    let bestSalonRevenue = 0;
    Object.entries(salesBySalon).forEach(([salon, revenue]) => {
        if (revenue > bestSalonRevenue) {
            bestSalonRevenue = revenue;
            bestSalon = salon.replace('Ортосалон ', '');
        }
    });

    const currentDebt = appData.suppliers.reduce((sum, supplier) => sum + parseFloat(supplier.debt), 0);

    document.getElementById('reportRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('reportExpenses').textContent = formatCurrency(totalExpenses);
    document.getElementById('reportProfit').textContent = formatCurrency(totalProfit);
    document.getElementById('reportPurchases').textContent = formatCurrency(totalPurchases);
    document.getElementById('reportSupplierPayments').textContent = formatCurrency(totalSupplierPayments);
    document.getElementById('reportSalaries').textContent = formatCurrency(totalSalaryPayments);
    document.getElementById('reportBalance').textContent = formatCurrency(balance);
    document.getElementById('reportBalance').style.color = balance >= 0 ? '#38a169' : '#e53e3e';

    document.getElementById('reportAvgCheck').textContent = formatCurrency(avgCheck);
    document.getElementById('reportSalesCount').textContent = salesCount;
    document.getElementById('reportProfitMargin').textContent = profitMargin + '%';
    document.getElementById('reportBestSalon').textContent = bestSalon;
    document.getElementById('reportBestSalonRevenue').textContent = formatCurrency(bestSalonRevenue);
    document.getElementById('reportCurrentDebt').textContent = formatCurrency(currentDebt);

    loadAuditLogTable(fromDateTime, toDateTime);
    generateExpensesBySalonChart(periodExpenses);

    document.getElementById('reportResults').style.display = 'block';
    document.getElementById('reportResults').scrollIntoView({ behavior: 'smooth' });
}

function generateExpensesBySalonChart(expenses) {
    const canvas = document.getElementById('expensesBySalonChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const expensesBySalon = {
        'Ортосалон Муниса': 0,
        'Ортосалон Сиема': 0,
        'Ортосалон Баракат': 0,
        'Ортосалон Айни': 0,
        'Общие': 0
    };

    expenses.forEach(expense => {
        const salon = expense.salon;
        if (expensesBySalon.hasOwnProperty(salon)) {
            expensesBySalon[salon] += parseFloat(expense.amount);
        } else {
            expensesBySalon['Общие'] += parseFloat(expense.amount);
        }
    });

    if (window.expensesBySalonChartInstance) {
        window.expensesBySalonChartInstance.destroy();
    }

    window.expensesBySalonChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(expensesBySalon).map(salon => salon.replace('Ортосалон ', '')),
            datasets: [{
                label: 'TJS',
                data: Object.values(expensesBySalon),
                backgroundColor: ['#FF9A76', '#8B7CFF', '#E361FF', '#4DD4AC', '#FFC185'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

function loadAuditLogTable(fromDate, toDate) {
    const tbody = document.querySelector('#auditLogTable tbody');
    
    const filteredLog = appData.auditLog.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        return entryDate >= fromDate && entryDate <= toDate;
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    tbody.innerHTML = filteredLog.map(entry => `
        <tr>
            <td>${formatDateTime(entry.timestamp)}</td>
            <td>${entry.admin}</td>
            <td>${entry.action}</td>
            <td>${entry.entityType}</td>
            <td>${entry.details}</td>
        </tr>
    `).join('');
}

// Modal functions
function hideModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

// Load all tables function
function loadAllTables() {
    loadAllSalesTable();
    loadExpensesTable();
    loadEmployeesTable();
    loadSalaryPaymentsTable();
    loadSuppliersTable();
    loadPurchasesTable();
    loadSupplierPaymentsHistory();
    populateEmployeeSelect();
    populateSupplierSelects();
    updateDebtSummary();
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        if (login(username, password)) {
            document.getElementById('loginError').style.display = 'none';
        } else {
            showError('Неверное имя пользователя или пароль.', 'loginError');
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', logout);

    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });

    document.querySelectorAll('.section-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const section = this.closest('.section').id.replace('Section', '');
            switchSectionTab(section, this.dataset.section);
        });
    });

    const fileUploadArea = document.getElementById('fileUploadArea');
    const fileInput = document.getElementById('fileInput');

    fileUploadArea.addEventListener('click', () => fileInput.click());
    fileUploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('dragover');
    });
    fileUploadArea.addEventListener('dragleave', function() {
        this.classList.remove('dragover');
    });
    fileUploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
        fileInput.files = e.dataTransfer.files;
        handleFileUpload();
    });

    fileInput.addEventListener('change', handleFileUpload);

    document.getElementById('confirmImport').addEventListener('click', confirmImport);
    document.getElementById('cancelImport').addEventListener('click', cancelImport);

    document.getElementById('addSaleForm').addEventListener('submit', addSale);
    document.getElementById('addExpenseForm').addEventListener('submit', addExpense);
    document.getElementById('addSalaryPaymentForm').addEventListener('submit', addSalaryPayment);
    document.getElementById('addPurchaseForm').addEventListener('submit', addPurchase);

    document.getElementById('addEmployeeBtn').addEventListener('click', showAddEmployeeModal);
    document.getElementById('saveEmployee').addEventListener('click', saveEmployee);

    document.getElementById('addSupplierBtn').addEventListener('click', showAddSupplierModal);
    document.getElementById('saveSupplier').addEventListener('click', saveSupplier);
    document.getElementById('confirmSupplierPayment').addEventListener('click', confirmSupplierPayment);
    document.getElementById('confirmEditPayment').addEventListener('click', confirmEditPayment);
    document.getElementById('filterPaymentHistoryBtn').addEventListener('click', function() {
        const fromDate = document.getElementById('paymentHistoryFromDate').value;
        const toDate = document.getElementById('paymentHistoryToDate').value;
        loadSupplierPaymentsHistory(fromDate, toDate);
    });
    document.getElementById('resetPaymentHistoryFilterBtn').addEventListener('click', function() {
        document.getElementById('paymentHistoryFromDate').value = '';
        document.getElementById('paymentHistoryToDate').value = '';
        loadSupplierPaymentsHistory();
    });


    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', hideModal);
    });

    document.getElementById('modalOverlay').addEventListener('click', function(e) {
        if (e.target === this) hideModal();
    });

    document.getElementById('expenseCategory').addEventListener('change', function() {
        const customGroup = document.getElementById('customCategoryGroup');
        if (this.value === 'Другое') {
            customGroup.style.display = 'block';
            document.getElementById('customCategory').required = true;
        } else {
            customGroup.style.display = 'none';
            document.getElementById('customCategory').required = false;
        }
    });

    document.getElementById('paymentType').addEventListener('change', function() {
        const paymentDate = document.getElementById('paymentDate');
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');

        if (this.value === 'base') {
            paymentDate.value = `${year}-${month}-15`;
        } else if (this.value === 'commission') {
            const lastDay = new Date(year, today.getMonth() + 1, 0).getDate();
            paymentDate.value = `${year}-${month}-${lastDay}`;
        }
    });

    document.getElementById('generateReport').addEventListener('click', generateReport);

    // Обработчик кнопки обновления курса обмена
    const updateExchangeRateBtn = document.getElementById('updateExchangeRateBtn');
    if (updateExchangeRateBtn) {
        updateExchangeRateBtn.addEventListener('click', async function() {
            const newRate = parseFloat(document.getElementById('exchangeRateInput').value);
            await updateExchangeRate(newRate);
        });
    }

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    document.getElementById('saleDate').value = today.toISOString().split('T')[0];
    document.getElementById('expenseDate').value = today.toISOString().split('T')[0];
    document.getElementById('paymentDate').value = today.toISOString().split('T')[0];
    document.getElementById('purchaseDate').value = today.toISOString().split('T')[0];
    document.getElementById('reportFromDate').value = firstDayOfMonth.toISOString().split('T')[0];
    document.getElementById('reportToDate').value = today.toISOString().split('T')[0];

    window.updateExchangeRate = updateExchangeRate;
    window.deleteSale = deleteSale;
    window.deleteExpense = deleteExpense;
    window.deleteEmployee = deleteEmployee;
    window.deleteSalaryPayment = deleteSalaryPayment;
    window.deleteSupplier = deleteSupplier;
    window.showSupplierPaymentModal = showSupplierPaymentModal;
    window.deletePurchase = deletePurchase;
});
