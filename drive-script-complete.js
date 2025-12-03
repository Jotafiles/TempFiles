// Configuración de Supabase
const SUPABASE_URL = 'https://bixhvswholyqsxovcijp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpeGh2c3dob2x5cXN4b3ZjaWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MjIzNzcsImV4cCI6MjA4MDI5ODM3N30.QShSMjDdKZ6qZIorFmuWhxz_u6DMFGYnFHm_xvIr_vU';

// Variables globales
let supabaseClient;
let currentView = 'grid';
let currentSection = 'myFiles';
let uploadFiles = [];
let userId = localStorage.getItem('driveUserId') || generateUserId();
let chatChannel;
let chatOpened = false;

// Generar ID de usuario
function generateUserId() {
    const id = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('driveUserId', id);
    return id;
}

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Inicializar Supabase
        initializeSupabase();
        
        // Cargar tema guardado
        loadSavedTheme();
        
        // Inicializar interfaz
        initializeUI();
        
        // Configurar eventos
        setupEventListeners();
        
        // Asegurarse de que existan las carpetas predeterminadas
        await ensureDefaultFolders();
        
        // Cargar carpetas en la barra lateral
        await loadDirectories();
        
        // Inicializar el chat
        initializeChat();
        
        // Suscribirse al chat
        setupChat();
        

        
        // Cargar contenido inicial
        loadContent('myFiles');

        await updateStorageInfo();

        setInterval(updateStorageInfo, 5 * 60 * 1000);
        
        console.log('TempFiles Drive inicializado correctamente');
    } catch (error) {
        console.error('Error inicializando TempFiles Drive:', error);
        showError('Error inicializando la aplicación. Por favor recarga la página.');
    }
});

// Inicializar cliente de Supabase
function initializeSupabase() {
    if (typeof supabase === 'undefined') {
        showError('Error crítico: No se pudo cargar Supabase. Revisa tu conexión.');
        return;
    }
    
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Inicializar el chat
function initializeChat() {
    if (!localStorage.getItem('driveUserId')) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('driveUserId', userId);
        registerUser(userId).catch(err => console.error('Error registrando usuario:', err));
    } else {
        userId = localStorage.getItem('driveUserId');
    }
}

// Registrar usuario en la base de datos
async function registerUser(userId) {
    try {
        const userName = 'Usuario ' + userId.substr(-4);
        const userColor = '#' + Math.floor(Math.random()*16777215).toString(16);
        
        const { error } = await supabaseClient
            .from('users')
            .upsert([{
                id: userId,
                name: userName,
                color: userColor,
                last_active: new Date().toISOString(),
                created_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        return { userName, userColor };
    } catch (error) {
        console.error('Error registrando usuario:', error);
        return { userName: 'Usuario', userColor: '#4f46e5' };
    }
}

// Verificar y crear carpetas predeterminadas
async function ensureDefaultFolders() {
    try {
        const defaultFolders = [
            { id: '00000000-0000-0000-0000-000000000001', name: 'Documentos', is_default: true },
            { id: '00000000-0000-0000-0000-000000000002', name: 'Imágenes', is_default: true },
            { id: '00000000-0000-0000-0000-000000000003', name: 'Videos', is_default: true },
            { id: '00000000-0000-0000-0000-000000000004', name: 'Audio', is_default: true },
        ];
        
        const { data, error } = await supabaseClient
            .from('folders')
            .select('id')
            .in('id', defaultFolders.map(f => f.id));
        
        if (error) throw error;
        
        const existingIds = new Set(data.map(f => f.id));
        const missingFolders = defaultFolders.filter(f => !existingIds.has(f.id));
        
        if (missingFolders.length > 0) {
            const foldersToInsert = missingFolders.map(f => ({
                ...f,
                is_public: true,
                created_at: new Date().toISOString()
            }));
            
            const { error: insertError } = await supabaseClient
                .from('folders')
                .insert(foldersToInsert);
            
            if (insertError) throw insertError;
            
            console.log(`${missingFolders.length} carpetas predeterminadas creadas`);
        }
        
    } catch (error) {
        console.error('Error verificando carpetas predeterminadas:', error);
    }
}

// Inicializar la interfaz
function initializeUI() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = e.currentTarget.id.replace('Link', '');
            loadContent(section);
            
            document.querySelectorAll('.nav-item').forEach(nav => {
                nav.classList.remove('active');
            });
            e.currentTarget.classList.add('active');
        });
    });
    
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}

// Configurar eventos
function setupEventListeners() {
    // Botón de menú para mostrar/ocultar sidebar
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            // En móvil: abrir/cerrar
            if (window.innerWidth <= 768) {
                sidebar.classList.toggle('open');
            } else {
                // En desktop: colapsar/expandir
                sidebar.classList.toggle('collapsed');
                // Guardar estado
                localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
            }
        });
        
        // Restaurar estado del sidebar
        if (localStorage.getItem('sidebarCollapsed') === 'true' && window.innerWidth > 768) {
            sidebar.classList.add('collapsed');
        }
    }
    
    // Cerrar menú de perfil al hacer clic fuera
    document.addEventListener('click', (e) => {
        const profileMenu = document.getElementById('profileMenu');
        const profileBtn = document.getElementById('profileBtn');
        if (profileMenu && profileBtn && !profileBtn.contains(e.target) && !profileMenu.contains(e.target)) {
            profileMenu.classList.remove('active');
        }
    });
    
    const mainFab = document.getElementById('mainFab');
    const fabOptions = document.getElementById('fabOptions');
    
    if (mainFab && fabOptions) {
        mainFab.addEventListener('click', (e) => {
            e.stopPropagation();
            mainFab.classList.toggle('active');
            fabOptions.classList.toggle('active');
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.fab-container') && fabOptions.classList.contains('active')) {
                mainFab.classList.remove('active');
                fabOptions.classList.remove('active');
            }
        });
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            if (searchInput.value.trim() !== '') {
                searchFiles(searchInput.value.trim());
            } else {
                loadContent(currentSection);
            }
        }, 300));
    }
    
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
}

// Cargar directorios/carpetas
async function loadDirectories() {
    try {
        const { data: folders, error } = await supabaseClient
            .from('folders')
            .select('*')
            .order('is_default', { ascending: false })
            .order('name');
        
        if (error) throw error;
        
        console.log('Carpetas cargadas:', folders);
        
        // Actualizar contadores
        await updateAllCounts();
        
    } catch (error) {
        console.error('Error cargando directorios:', error);
    }
}

// Actualizar todos los contadores
async function updateAllCounts() {
    try {
        // Contar todos los archivos (Mi unidad)
        const { count: totalCount } = await supabaseClient
            .from('documents')
            .select('*', { count: 'exact', head: true });
        
        // Contar mis subidas
        const { count: myUploadsCount } = await supabaseClient
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('created_by', userId);
        
        // Contar destacados
        const { count: starredCount } = await supabaseClient
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('starred', true);
        
        // Contar compartidos
        const { count: sharedCount } = await supabaseClient
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('is_shared', true);
        
        // Actualizar contadores en la UI
        const myFilesEl = document.getElementById('myFilesCount');
        const myUploadsEl = document.getElementById('myUploadsCount');
        const starredEl = document.getElementById('starredCount');
        const recentEl = document.getElementById('recentCount');
        const sharedEl = document.getElementById('sharedCount');
        
        if (myFilesEl) myFilesEl.textContent = totalCount || 0;
        if (myUploadsEl) myUploadsEl.textContent = myUploadsCount || 0;
        if (starredEl) starredEl.textContent = starredCount || 0;
        if (recentEl) recentEl.textContent = Math.min(totalCount || 0, 20);
        if (sharedEl) sharedEl.textContent = sharedCount || 0;
        
    } catch (error) {
        console.error('Error actualizando contadores:', error);
    }
}

// Cargar contenido según la sección
async function loadContent(section) {
    currentSection = section;
    const contentArea = document.getElementById('content');
    
    contentArea.innerHTML = `
        <div class="loading" style="display: flex; justify-content: center; padding: 100px;">
            <svg width="40" height="40" viewBox="0 0 24 24">
                <style>
                    @keyframes rotate { to { transform: rotate(360deg); } }
                </style>
                <circle cx="12" cy="12" r="10" stroke="#e0e0e0" stroke-width="4" fill="none" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" fill="none" style="animation: rotate 1s linear infinite;" />
            </svg>
        </div>
    `;
    
    try {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeLink = document.getElementById(section + 'Link');
        if (activeLink) {
            activeLink.classList.add('active');
        }
        
        let query = supabaseClient.from('documents').select('*').order('upload_date', { ascending: false });
        
        switch (section) {
            case 'myFiles':
                break;
            case 'myUploads':
                query = query.eq('created_by', userId);
                break;
            case 'starred':
                query = query.eq('starred', true);
                break;
            case 'recent':
                query = query.limit(20);
                break;
            case 'shared':
                query = query.eq('is_shared', true);
                break;
            default:
                if (section.startsWith('folder_')) {
                    const folderId = section.replace('folder_', '');
                    query = query.eq('folder_id', folderId);
                }
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        renderFiles(contentArea, data, section);
        
    } catch (error) {
        console.error('Error cargando contenido:', error);
        contentArea.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" width="64" height="64">
                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                </svg>
                <h3>Error cargando contenido</h3>
                <p>${error.message}</p>
                <button class="primary-button" onclick="loadContent('${section}')">Reintentar</button>
            </div>
        `;
    }
}

// Renderizar archivos
function renderFiles(contentArea, files, section) {
    let title = 'Mi unidad';
    
    switch (section) {
        case 'myFiles': title = 'Mi unidad'; break;
        case 'shared': title = 'Compartido conmigo'; break;
        case 'recent': title = 'Recientes'; break;
        case 'starred': title = 'Destacados'; break;
        case 'myUploads': title = 'Mis subidas'; break;
    }

    if (!files || files.length === 0) {
        contentArea.innerHTML = `
            <div class="section-header">
                <h2 class="section-title">${title}</h2>
            </div>
            <div class="empty-state">
                <svg viewBox="0 0 24 24" width="64" height="64">
                    <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                </svg>
                <h3>No hay archivos</h3>
                <p>Los archivos que subas aparecerán aquí</p>
                <button class="primary-button" onclick="openUploadModal()">
                    <svg viewBox="0 0 24 24" width="18" height="18" style="margin-right: 8px;">
                        <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    Subir archivo
                </button>
            </div>
        `;
        return;
    }

    let html = `
        <div class="section-header">
            <h2 class="section-title">${title}</h2>
            <div class="view-options">
                <button class="view-option ${currentView === 'grid' ? 'active' : ''}" onclick="changeView('grid')">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M3 3v8h8V3H3zm0 18h8v-8H3v8zm10 0h8v-8h-8v8zm8-18h-8v8h8V3z"/>
                    </svg>
                </button>
                <button class="view-option ${currentView === 'list' ? 'active' : ''}" onclick="changeView('list')">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M3 14h4v-4H3v4zm0 5h4v-4H3v4zM3 9h4V5H3v4zm5 5h13v-4H8v4zm0 5h13v-4H8v4zM8 5v4h13V5H8z"/>
                    </svg>
                </button>
            </div>
        </div>
    `;

    if (currentView === 'grid') {
        html += '<div class="files-grid">';
        files.forEach(file => {
            const fileIcon = getFileIcon(file.file_type);
            const formattedDate = new Date(file.upload_date).toLocaleDateString();
            const formattedSize = formatFileSize(file.file_size);
            
            html += `
                <div class="file-card" onclick="previewFile('${file.id}')">
                    <div class="file-thumbnail">${fileIcon}</div>
                    <div class="file-info">
                        <div class="file-title">${file.title || file.file_name}</div>
                        <div class="file-meta">${formattedDate} • ${formattedSize}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    } else {
        html += `
            <div class="files-list">
                <div class="list-header">
                    <div>Nombre</div>
                    <div>Fecha</div>
                    <div>Tamaño</div>
                </div>
        `;
        files.forEach(file => {
            const fileIcon = getFileIcon(file.file_type);
            const formattedDate = new Date(file.upload_date).toLocaleDateString();
            const formattedSize = formatFileSize(file.file_size);
            
            html += `
                <div class="file-item" onclick="previewFile('${file.id}')">
                    <div class="file-name-col">
                        <div class="file-icon">${fileIcon}</div>
                        <div class="file-name-text">${file.title || file.file_name}</div>
                    </div>
                    <div class="file-date">${formattedDate}</div>
                    <div class="file-size">${formattedSize}</div>
                </div>
            `;
        });
        html += '</div>';
    }

    contentArea.innerHTML = html;
}

// Cambiar vista
function changeView(view) {
    currentView = view;
    loadContent(currentSection);
}

// Buscar archivos
async function searchFiles(query) {
    try {
        const { data, error } = await supabaseClient
            .from('documents')
            .select('*')
            .ilike('title', `%${query}%`)
            .order('upload_date', { ascending: false });
        
        if (error) throw error;
        
        const contentArea = document.getElementById('content');
        renderFiles(contentArea, data, 'search');
        
    } catch (error) {
        console.error('Error buscando archivos:', error);
    }
}

// Obtener icono de archivo
function getFileIcon(fileType) {
    const icons = {
        'image': '<svg viewBox="0 0 24 24" width="48" height="48"><path fill="#4285f4" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
        'video': '<svg viewBox="0 0 24 24" width="48" height="48"><path fill="#ea4335" d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
        'audio': '<svg viewBox="0 0 24 24" width="48" height="48"><path fill="#fbbc04" d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>',
        'document': '<svg viewBox="0 0 24 24" width="48" height="48"><path fill="#4285f4" d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
        'pdf': '<svg viewBox="0 0 24 24" width="48" height="48"><path fill="#ea4335" d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>',
        'spreadsheet': '<svg viewBox="0 0 24 24" width="48" height="48"><path fill="#0f9d58" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>',
        'archive': '<svg viewBox="0 0 24 24" width="48" height="48"><path fill="#5f6368" d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>'
    };
    
    return icons[fileType] || icons['document'];
}

// Formatear tamaño de archivo
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Tema
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Modales
function openUploadModal() {
    fillFolderSelect('folderSelect');
    document.getElementById('uploadModal').classList.add('active');
    document.getElementById('fileList').innerHTML = '';
    setupDropArea();
}

function openNewFolderModal() {
    fillFolderSelect('parentFolderSelect');
    document.getElementById('newFolderModal').classList.add('active');
    document.getElementById('newFolderName').focus();
}

function closeAllModals() {
    document.querySelectorAll('.modal-container').forEach(modal => {
        modal.classList.remove('active');
    });
}

// Llenar selector de carpetas
async function fillFolderSelect(selectId) {
    try {
        const { data, error } = await supabaseClient
            .from('folders')
            .select('*')
            .order('name', { ascending: true });
        
        if (error) throw error;
        
        const select = document.getElementById(selectId);
        if (!select) return;
        
        const rootOption = select.querySelector('option[value=""]');
        select.innerHTML = '';
        if (rootOption) {
            select.appendChild(rootOption);
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Raíz (nivel principal)';
            select.appendChild(option);
        }
        
        data.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error('Error cargando carpetas:', error);
    }
}

// Crear carpeta
async function createFolder() {
    const folderName = document.getElementById('newFolderName').value.trim();
    if (!folderName) {
        showError('Por favor ingresa un nombre para la carpeta');
        return;
    }
    
    const parentFolderId = document.getElementById('parentFolderSelect').value;
    const color = document.getElementById('folderColorPicker').value;
    
    try {
        const { error } = await supabaseClient
            .from('folders')
            .insert([{
                name: folderName,
                parent_id: parentFolderId || null,
                color: color,
                is_default: false,
                is_public: true,
                created_by: userId,
                created_at: new Date().toISOString()
            }]);
        
        if (error) throw error;
        
        closeAllModals();
        document.getElementById('newFolderName').value = '';
        showSuccess('Carpeta creada con éxito');
        
        await loadDirectories();
        await updateAllCounts();
        loadContent('myFiles');
        
    } catch (error) {
        console.error('Error creando carpeta:', error);
        showError('Error al crear la carpeta: ' + error.message);
    }
}

// Configurar área de arrastrar y soltar
function setupDropArea() {
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    
    if (!dropArea || !fileInput) return;
    
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('drag-over');
    });
    
    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('drag-over');
    });
    
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('drag-over');
        
        if (e.dataTransfer.files.length > 0) {
            handleFileSelection(e.dataTransfer.files);
        }
    });
    
    dropArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelection(e.target.files);
        }
    });
}

// Manejar selección de archivos
function handleFileSelection(files) {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    
    uploadFiles = Array.from(files);
    
    fileList.innerHTML = '';
    uploadFiles.forEach((file) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-list-item';
        
        const fileName = file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name;
        
        fileItem.innerHTML = `
            <div>
                <div>${fileName}</div>
                <div class="file-progress">
                    <div class="file-progress-bar" style="width: 0%"></div>
                </div>
            </div>
            <div>${formatFileSize(file.size)}</div>
            <div>Pendiente</div>
        `;
        
        fileList.appendChild(fileItem);
    });
    
    const uploadBtn = document.getElementById('uploadFilesBtn');
    if (uploadBtn) {
        uploadBtn.disabled = uploadFiles.length === 0;
    }
}

// Subir archivos
async function uploadSelectedFiles() {
    if (uploadFiles.length === 0) return;
    
    const fileListItems = document.querySelectorAll('.file-list-item');
    const uploadBtn = document.getElementById('uploadFilesBtn');
    const folderSelect = document.getElementById('folderSelect');
    const folderId = folderSelect ? folderSelect.value || null : null;
    
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Subiendo...';
    }
    
    let successCount = 0;
    
    for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        const fileItem = fileListItems[i];
        const progressBar = fileItem.querySelector('.file-progress-bar');
        const statusElement = fileItem.querySelector('div:last-child');
        
        try {
            statusElement.textContent = 'Subiendo...';
            
            const title = file.name.split('.')[0];
            const timestamp = Date.now();
            const filePath = `${timestamp}_${file.name.replace(/\s+/g, '_')}`;
            const fileType = getFileTypeFromName(file.name);
            
            // Simular progreso
            progressBar.style.width = '50%';
            
            // Subir archivo
            const { error: uploadError } = await supabaseClient.storage
                .from('documents-bucket')
                .upload(filePath, file, { cacheControl: '3600', upsert: false });
            
            if (uploadError) throw uploadError;
            
            progressBar.style.width = '75%';
            
            // Guardar metadatos
            const { error } = await supabaseClient
                .from('documents')
                .insert([{
                    title: title,
                    file_name: file.name,
                    file_path: filePath,
                    file_type: fileType,
                    file_size: file.size,
                    folder_id: folderId,
                    created_by: userId,
                    is_shared: true,
                    upload_date: new Date().toISOString(),
                    last_modified: new Date().toISOString()
                }]);
            
            if (error) throw error;
            
            progressBar.style.width = '100%';
            statusElement.textContent = 'Completado';
            statusElement.style.color = 'var(--secondary)';
            successCount++;
            
        } catch (error) {
            console.error(`Error subiendo ${file.name}:`, error);
            progressBar.style.backgroundColor = 'var(--accent)';
            statusElement.textContent = 'Error';
            statusElement.style.color = 'var(--accent)';
        }
    }
    
    if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Subir';
    }
    
    if (successCount > 0) {
        showSuccess(`${successCount} archivo(s) subido(s) correctamente`);
    }
    
    setTimeout(async () => {
        await updateAllCounts();
        loadContent(currentSection);
        closeAllModals();
    }, 1000);
}

// Obtener tipo de archivo
function getFileTypeFromName(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac'];
    const documentExts = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
    const spreadsheetExts = ['xls', 'xlsx', 'csv'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];
    
    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (documentExts.includes(ext)) return 'document';
    if (spreadsheetExts.includes(ext)) return 'spreadsheet';
    if (archiveExts.includes(ext)) return 'archive';
    
    return 'document';
}

// Previsualizar archivo
async function previewFile(id) {
    try {
        const { data, error } = await supabaseClient
            .from('documents')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        if (!data) throw new Error('Archivo no encontrado');
        
        const { data: { publicUrl } } = supabaseClient.storage
            .from('documents-bucket')
            .getPublicUrl(data.file_path);
        
        // Detectar si es un archivo comprimido
        const ext = data.file_name.split('.').pop().toLowerCase();
        const isArchive = ['zip', 'rar', '7z'].includes(ext);
        
        if (isArchive && ext === 'zip') {
            // Mostrar contenido del ZIP
            await previewZipFile(data, publicUrl);
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal-container active';
        modal.id = 'previewModal';
        
        let previewContent = '';
        
        if (data.file_type === 'image') {
            previewContent = `<img src="${publicUrl}" alt="${data.title}" style="max-width: 100%; max-height: 70vh;">`;
        } else if (data.file_type === 'video') {
            previewContent = `<video src="${publicUrl}" controls style="max-width: 100%; max-height: 70vh;"></video>`;
        } else if (data.file_type === 'audio') {
            previewContent = `
                <div style="padding: 20px; text-align: center;">
                    <div style="font-size: 72px; margin-bottom: 20px;">🎵</div>
                    <audio src="${publicUrl}" controls></audio>
                </div>
            `;
        } else if (isArchive) {
            // Para RAR y 7Z mostrar mensaje
            previewContent = `
                <div style="padding: 40px; text-align: center;">
                    <div style="font-size: 72px; margin-bottom: 20px;">${getFileIcon('archive')}</div>
                    <p style="margin-bottom: 16px;">Este es un archivo <strong>.${ext.toUpperCase()}</strong></p>
                    <p style="color: var(--text-secondary);">La vista previa solo está disponible para archivos .ZIP</p>
                </div>
            `;
        } else {
            previewContent = `
                <div style="padding: 40px; text-align: center;">
                    <div style="font-size: 72px; margin-bottom: 20px;">${getFileIcon(data.file_type)}</div>
                    <p>La vista previa no está disponible para este tipo de archivo.</p>
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h2>${data.title || data.file_name}</h2>
                    <button class="close-modal-btn" onclick="document.getElementById('previewModal').remove()">
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body" style="padding: 0;">
                    ${previewContent}
                </div>
                <div class="modal-footer">
                    <div style="flex: 1; text-align: left; color: var(--text-secondary);">
                        ${formatFileSize(data.file_size)} • ${new Date(data.upload_date).toLocaleDateString()}
                    </div>
                    <a href="${publicUrl}" download="${data.file_name}" class="primary-button">
                        <svg viewBox="0 0 24 24" width="18" height="18" style="margin-right: 8px;">
                            <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                        </svg>
                        Descargar
                    </a>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
    } catch (error) {
        console.error('Error previsualizando archivo:', error);
        showError('Error al previsualizar el archivo');
    }
}

// Previsualizar archivo ZIP
async function previewZipFile(fileData, publicUrl) {
    const modal = document.createElement('div');
    modal.className = 'modal-container active';
    modal.id = 'previewModal';
    
    modal.innerHTML = `
        <div class="modal" style="max-width: 700px;">
            <div class="modal-header">
                <h2>📦 ${fileData.file_name}</h2>
                <button class="close-modal-btn" onclick="document.getElementById('previewModal').remove()">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
            <div class="modal-body" style="padding: 16px;">
                <div id="zipLoading" style="text-align: center; padding: 40px;">
                    <div class="loading-spinner"></div>
                    <p style="margin-top: 16px; color: var(--text-secondary);">Cargando contenido del archivo...</p>
                </div>
                <div id="zipContent" style="display: none;">
                    <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 8px;">
                        <span style="color: var(--text-secondary);">Archivos en el ZIP:</span>
                        <strong id="zipFileCount">0</strong>
                    </div>
                    <div id="zipFileList" class="zip-file-list"></div>
                </div>
                <div id="zipError" style="display: none; text-align: center; padding: 40px; color: var(--accent);">
                    <p>No se pudo leer el archivo ZIP</p>
                </div>
            </div>
            <div class="modal-footer">
                <div style="flex: 1; text-align: left; color: var(--text-secondary);">
                    ${formatFileSize(fileData.file_size)} • ${new Date(fileData.upload_date).toLocaleDateString()}
                </div>
                <a href="${publicUrl}" download="${fileData.file_name}" class="primary-button">
                    <svg viewBox="0 0 24 24" width="18" height="18" style="margin-right: 8px;">
                        <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                    </svg>
                    Descargar ZIP completo
                </a>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Cargar y leer el ZIP
    try {
        const response = await fetch(publicUrl);
        const blob = await response.blob();
        const zip = await JSZip.loadAsync(blob);
        
        const files = [];
        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
                files.push({
                    name: relativePath,
                    size: zipEntry._data ? zipEntry._data.uncompressedSize : 0,
                    entry: zipEntry
                });
            }
        });
        
        // Ordenar por nombre
        files.sort((a, b) => a.name.localeCompare(b.name));
        
        document.getElementById('zipLoading').style.display = 'none';
        document.getElementById('zipContent').style.display = 'block';
        document.getElementById('zipFileCount').textContent = files.length + ' archivos';
        
        const listContainer = document.getElementById('zipFileList');
        listContainer.innerHTML = '';
        
        files.forEach((file, index) => {
            const fileName = file.name.split('/').pop();
            const folderPath = file.name.includes('/') ? file.name.substring(0, file.name.lastIndexOf('/')) : '';
            const ext = fileName.split('.').pop().toLowerCase();
            const icon = getZipFileIcon(ext);
            
            const item = document.createElement('div');
            item.className = 'zip-file-item';
            item.innerHTML = `
                <div class="zip-file-icon">${icon}</div>
                <div class="zip-file-info">
                    <div class="zip-file-name">${fileName}</div>
                    ${folderPath ? `<div class="zip-file-path">${folderPath}</div>` : ''}
                </div>
                <div class="zip-file-size">${formatFileSize(file.size)}</div>
                <button class="zip-download-btn" onclick="downloadZipEntry(${index})" title="Descargar este archivo">
                    <svg viewBox="0 0 24 24" width="18" height="18">
                        <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                    </svg>
                </button>
            `;
            listContainer.appendChild(item);
        });
        
        // Guardar referencia al ZIP para descargas individuales
        window.currentZipFiles = files;
        
    } catch (err) {
        console.error('Error leyendo ZIP:', err);
        document.getElementById('zipLoading').style.display = 'none';
        document.getElementById('zipError').style.display = 'block';
    }
}

// Descargar archivo individual del ZIP
async function downloadZipEntry(index) {
    try {
        const file = window.currentZipFiles[index];
        if (!file) return;
        
        showSuccess('Preparando descarga...');
        
        const content = await file.entry.async('blob');
        const url = URL.createObjectURL(content);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name.split('/').pop();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (err) {
        console.error('Error descargando archivo:', err);
        showError('Error al descargar el archivo');
    }
}

// Obtener icono para archivo en ZIP
function getZipFileIcon(ext) {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
    const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv'];
    const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac'];
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
    const codeExts = ['js', 'ts', 'py', 'html', 'css', 'json', 'xml', 'java', 'cpp', 'c', 'php'];
    
    if (imageExts.includes(ext)) return '🖼️';
    if (videoExts.includes(ext)) return '🎬';
    if (audioExts.includes(ext)) return '🎵';
    if (docExts.includes(ext)) return '📄';
    if (codeExts.includes(ext)) return '💻';
    if (ext === 'exe') return '⚙️';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
    
    return '📄';
}

// Chat
function setupChat() {
    if (!supabaseClient) return;
    
    try {
        loadChatHistory();
        
        chatChannel = supabaseClient.channel('public_chat')
            .on('broadcast', { event: 'new_message' }, (payload) => {
                const message = payload.payload;
                
                if (message.user_id !== userId) {
                    if (chatOpened) {
                        displayChatMessage(message);
                        scrollChatToBottom();
                    } else {
                        const badge = document.getElementById('chatBadge');
                        if (badge) {
                            const count = parseInt(badge.textContent) || 0;
                            badge.textContent = count + 1;
                            badge.classList.add('active');
                        }
                    }
                }
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Suscrito al chat correctamente');
                }
            });
    } catch (error) {
        console.error('Error configurando chat:', error);
    }
}

async function loadChatHistory() {
    try {
        const { data, error } = await supabaseClient
            .from('chat_messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(30);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                chatMessages.innerHTML = '';
                data.reverse().forEach(message => {
                    displayChatMessage(message);
                });
                scrollChatToBottom();
            }
        }
    } catch (error) {
        console.error('Error cargando historial del chat:', error);
    }
}

function toggleChat() {
    const chatContainer = document.getElementById('chatContainer');
    const chatBadge = document.getElementById('chatBadge');
    
    if (!chatContainer) return;
    
    // Verificar si el usuario ya tiene nombre guardado
    const storedName = localStorage.getItem('chatUsername');
    
    // Si no tiene nombre y quiere abrir el chat, mostrar modal
    if (!storedName && !chatOpened) {
        showUsernameModal();
        return;
    }
    
    chatOpened = !chatOpened;
    
    if (chatOpened) {
        chatContainer.classList.add('active');
        if (chatBadge) {
            chatBadge.textContent = '0';
            chatBadge.classList.remove('active');
        }
        scrollChatToBottom();
    } else {
        chatContainer.classList.remove('active');
    }
}

// Mostrar modal para pedir nombre de usuario
function showUsernameModal() {
    const modal = document.getElementById('usernameModal');
    if (modal) {
        modal.classList.add('active');
        const input = document.getElementById('usernameInput');
        if (input) {
            input.value = '';
            input.focus();
            
            // Permitir Enter para confirmar
            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveUsername();
                }
            };
        }
    }
}

// Guardar nombre de usuario
function saveUsername() {
    const input = document.getElementById('usernameInput');
    if (!input) return;
    
    const name = input.value.trim();
    
    if (!name || name.length < 2) {
        showError('Por favor ingresa un nombre válido (mínimo 2 caracteres)');
        return;
    }
    
    // Guardar nombre
    localStorage.setItem('chatUsername', name);
    
    // Cerrar modal
    const modal = document.getElementById('usernameModal');
    if (modal) modal.classList.remove('active');
    
    // Ahora abrir el chat
    toggleChat();
    
    showSuccess(`¡Bienvenido ${name}! Ya puedes chatear`);
}

// Obtener nombre guardado
function getChatUsername() {
    return localStorage.getItem('chatUsername') || 'Usuario';
}

// Generar color consistente basado en un string
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Colores predefinidos para mejor contraste
    const colors = [
        '#1a1a1a', '#3b82f6', '#10b981', '#f59e0b', 
        '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4',
        '#84cc16', '#f97316', '#6366f1', '#14b8a6'
    ];
    
    return colors[Math.abs(hash) % colors.length];
}

let chatFile = null;

function handleChatFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.includes('image/')) {
        showError('Solo se permiten imágenes en el chat');
        return;
    }
    
    chatFile = file;
    
    const filePreview = document.getElementById('chatFilePreview');
    const fileImg = document.getElementById('chatFileImg');
    const fileName = document.getElementById('chatFileName');
    
    if (!filePreview || !fileImg || !fileName) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        fileImg.src = e.target.result;
        fileName.textContent = file.name.length > 20 ? file.name.substr(0, 17) + '...' : file.name;
        filePreview.classList.add('active');
    };
    reader.readAsDataURL(file);
}

function removeChatFile() {
    chatFile = null;
    const fileInput = document.getElementById('chatFileInput');
    const filePreview = document.getElementById('chatFilePreview');
    
    if (fileInput) fileInput.value = '';
    if (filePreview) filePreview.classList.remove('active');
}

async function sendChatMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    
    const message = input.value.trim();
    
    if (!message && !chatFile) return;
    
    let fileUrl = null;
    
    try {
        if (chatFile) {
            const filePath = `chat/${Date.now()}_${chatFile.name.replace(/\s+/g, '_')}`;
            
            const { error: uploadError } = await supabaseClient.storage
                .from('chat-files')
                .upload(filePath, chatFile, { cacheControl: '3600' });
            
            if (uploadError) throw uploadError;
            
            const { data: { publicUrl } } = supabaseClient.storage
                .from('chat-files')
                .getPublicUrl(filePath);
            
            fileUrl = publicUrl;
        }
        
        // Obtener el nombre guardado del usuario
        const userName = getChatUsername();
        
        // Generar color basado en el nombre (consistente)
        const userColor = stringToColor(userName);
        
        const messageData = {
            user_id: userId,
            user_name: userName,
            user_color: userColor,
            message: message,
            file_url: fileUrl,
            file_type: chatFile ? 'image' : 'text',
            created_at: new Date().toISOString()
        };
        
        const { error } = await supabaseClient
            .from('chat_messages')
            .insert([messageData]);
        
        if (error) throw error;
        
        await chatChannel.send({
            type: 'broadcast',
            event: 'new_message',
            payload: messageData
        });
        
        displayChatMessage(messageData, true);
        
        input.value = '';
        removeChatFile();
        
        scrollChatToBottom();
        
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        showError('Error al enviar el mensaje');
    }
}

function displayChatMessage(message, isMine = false) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    if (chatMessages.querySelector('.chat-welcome')) {
        chatMessages.innerHTML = '';
    }
    
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${isMine || message.user_id === userId ? 'sent' : ''}`;
    
    const firstLetter = message.user_name ? message.user_name.charAt(0).toUpperCase() : 'U';
    const time = new Date(message.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    let headerHTML = '';
    if (!(isMine || message.user_id === userId)) {
        headerHTML = `
            <div class="chat-message-header">
                <div class="chat-message-avatar" style="background-color: ${message.user_color || 'var(--primary)'}">
                    ${firstLetter}
                </div>
                <div class="chat-message-name">${escapeHTML(message.user_name || 'Usuario')}</div>
                <div class="chat-message-time">${time}</div>
            </div>
        `;
    } else {
        headerHTML = `
            <div class="chat-message-header">
                <div class="chat-message-time">${time}</div>
            </div>
        `;
    }
    
    let contentHTML = '';
    if (message.message) {
        contentHTML += `<div class="chat-message-bubble">${escapeHTML(message.message)}</div>`;
    }
    
    if (message.file_url) {
        contentHTML += `
            <img src="${message.file_url}" alt="Imagen" class="chat-message-image" 
                onclick="window.open('${message.file_url}', '_blank')">
        `;
    }
    
    messageEl.innerHTML = headerHTML + contentHTML;
    chatMessages.appendChild(messageEl);
}

function scrollChatToBottom() {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utilidades
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showSuccess(message) {
    const toast = document.createElement('div');
    toast.className = 'success-toast';
    toast.innerHTML = `
        <div class="success-icon">
            <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
        </div>
        <div class="success-message">${message}</div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showError(message) {
    const toast = document.createElement('div');
    toast.className = 'error-toast';
    toast.innerHTML = `
        <div class="error-icon">
            <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
        </div>
        <div class="error-message">${message}</div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Toggle menú de perfil
function toggleProfileMenu() {
    const profileMenu = document.getElementById('profileMenu');
    if (profileMenu) {
        profileMenu.classList.toggle('active');
    }
}


// Actualizar información de almacenamiento
async function updateStorageInfo() {
    try {
        // Obtener el uso de almacenamiento de Supabase
        const { data: storageData, error: storageError } = await supabaseClient
            .from('documents')
            .select('file_size');
            
        if (storageError) throw storageError;

        // Calcular espacio total usado
        const usedBytes = storageData.reduce((total, file) => total + (parseInt(file.file_size) || 0), 0);
        const usedGB = (usedBytes / (1024 * 1024 * 1024)).toFixed(2);
        const totalGB = 100; // Límite de almacenamiento en GB
        
        // Actualizar la barra de progreso
        const usedPercentage = Math.min(100, (usedBytes / (totalGB * 1024 * 1024 * 1024)) * 100);
        document.querySelector('.storage-used').style.width = `${usedPercentage}%`;
        
        // Actualizar el texto
        document.querySelector('.storage-details').textContent = 
            `${usedGB} GB de ${totalGB} GB usados (${Math.round(usedPercentage)}%)`;
            
        // Cambiar color según el uso
        const storageBar = document.querySelector('.storage-used');
        if (usedPercentage > 90) {
            storageBar.style.background = 'var(--error)';
        } else if (usedPercentage > 70) {
            storageBar.style.background = 'var(--warning)';
        } else {
            storageBar.style.background = 'var(--success)';
        }
        
    } catch (error) {
        console.error('Error actualizando información de almacenamiento:', error);
    }
}

// Llamar a la función cuando se cargue la página
document.addEventListener('DOMContentLoaded', () => {
    // ... otro código de inicialización ...
    updateStorageInfo();
    
    // Actualizar cada 5 minutos
    setInterval(updateStorageInfo, 5 * 60 * 1000);
});

