// Store settings manager
let storeSettings = null;

// Load store settings from localStorage or server
async function loadStoreSettings() {
    try {
        // Try to get from localStorage first
        const storedSettings = localStorage.getItem('storeSettings');
        if (storedSettings) {
            storeSettings = JSON.parse(storedSettings);
            applySettingsToStore(storeSettings);
        }

        // Try to get from server (for non-admin pages)
        try {
            const response = await fetch('/api/public/settings');
            if (response.ok) {
                const serverSettings = await response.json();
                storeSettings = { ...storeSettings, ...serverSettings };
                localStorage.setItem('storeSettings', JSON.stringify(storeSettings));
                applySettingsToStore(storeSettings);
            }
        } catch (error) {
            console.log('Could not load settings from server:', error.message);
        }
    } catch (error) {
        console.error('Error loading store settings:', error);
    }
}

// Apply settings to the current page
function applySettingsToStore(settings) {
    if (!settings) return;

    // Update store name in navbar
    const storeNameElements = document.querySelectorAll('.navbar-brand');
    storeNameElements.forEach(element => {
        const currentText = element.textContent;
        if (currentText.includes('Shop') || currentText.includes(settings.storeName)) {
            element.innerHTML = `<i class="fas fa-shopping-bag me-2"></i>${settings.storeName || 'Shop'}`;
        }
    });

    // Update page title
    const titleElement = document.querySelector('title');
    if (titleElement) {
        const currentTitle = titleElement.textContent;
        if (currentTitle.includes('Shop')) {
            titleElement.textContent = currentTitle.replace('Shop', settings.storeName || 'Shop');
        }
    }

    // Update footer
    const footerElements = document.querySelectorAll('footer h5');
    footerElements.forEach(element => {
        if (element.textContent === 'Shop' || element.textContent.includes('Shop')) {
            element.textContent = settings.storeName || 'Shop';
        }
    });

    // Update copyright
    const copyrightElements = document.querySelectorAll('footer p');
    copyrightElements.forEach(element => {
        const currentText = element.textContent;
        if (currentText.includes('Shop')) {
            element.innerHTML = currentText.replace(/Shop/g, settings.storeName || 'Shop');
        }
    });

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription && settings.storeName) {
        const currentDesc = metaDescription.getAttribute('content');
        if (currentDesc.includes('Shop')) {
            metaDescription.setAttribute('content', currentDesc.replace(/Shop/g, settings.storeName));
        }
    }
}

// Get current page title
function getPageTitle() {
    const path = window.location.pathname;
    if (path.includes('index.html') || path === '/') return 'Inicio';
    if (path.includes('products.html')) return 'Productos';
    if (path.includes('about.html')) return 'Nosotros';
    if (path.includes('admin/')) return 'Admin';
    return 'Tienda';
}

// Initialize settings when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Only load settings on non-admin pages
    if (!window.location.pathname.includes('admin/')) {
        loadStoreSettings();
    }
});

// Listen for storage changes (when admin updates settings)
window.addEventListener('storage', function(e) {
    if (e.key === 'storeSettings') {
        storeSettings = JSON.parse(e.newValue);
        applySettingsToStore(storeSettings);
    }
});
