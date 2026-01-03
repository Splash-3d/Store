let products = [];
let categories = [];
let currentEditingProduct = null;
let currentEditingCategory = null;

document.addEventListener('DOMContentLoaded', function() {
    if (!isAuthenticated()) {
        window.location.href = 'login.html';
        return;
    }

    loadDashboardData();
    loadProducts();
    loadCategories();
    loadOrders();
    loadSettings();
    setupEventListeners();
    setupRealTimeUpdates();
    initializeEnhancements();
});

/* ---------------------------
   AUTH & SESSION HELPERS
---------------------------- */

function isAuthenticated() {
    const hasSession = localStorage.getItem('adminSession') || sessionStorage.getItem('adminSession');
    const token = getSessionToken();
    return !!hasSession && !!token;
}

function getSessionToken() {
    return localStorage.getItem('adminToken') || sessionStorage.getItem('adminToken');
}

function getAuthHeaders() {
    const token = getSessionToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function handleAuthError() {
    console.log('Authentication error, clearing session and redirecting to login');
    clearSession();
    showNotification('Sesión expirada. Por favor, inicia sesión nuevamente.', 'warning');
    setTimeout(() => {
        window.location.href = 'login.html';
    }, 2000);
}

function clearSession() {
    localStorage.removeItem('adminSession');
    sessionStorage.removeItem('adminSession');
    localStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminToken');
}

/* ---------------------------
   EVENT LISTENERS
---------------------------- */

function setupEventListeners() {
    document.getElementById('productSearch').addEventListener('input', filterProducts);
    document.getElementById('categoryFilter').addEventListener('change', filterProducts);
    document.getElementById('statusFilter').addEventListener('change', filterProducts);

    // Order search and filters (only if elements exist)
    const orderSearch = document.getElementById('orderSearch');
    if (orderSearch) {
        orderSearch.addEventListener('input', filterOrders);
    }
    
    const orderStatusFilter = document.getElementById('statusFilter');
    if (orderStatusFilter) {
        orderStatusFilter.addEventListener('change', filterOrders);
    }
    
    const dateFilter = document.getElementById('dateFilter');
    if (dateFilter) {
        dateFilter.addEventListener('change', filterOrders);
    }
    
    const paymentFilter = document.getElementById('paymentFilter');
    if (paymentFilter) {
        paymentFilter.addEventListener('change', filterOrders);
    }

    // Analytics period selector (only if element exists)
    const analyticsPeriod = document.getElementById('analyticsPeriod');
    if (analyticsPeriod) {
        analyticsPeriod.addEventListener('change', refreshAnalytics);
    }

    // Image preview functionality
    document.getElementById('productImage').addEventListener('change', function(e) {
        const file = e.target.files[0];
        const preview = document.getElementById('imagePreview');
        
        if (file) {
            // Check file size (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                showNotification('El archivo es demasiado grande. Máximo 5MB', 'danger');
                e.target.value = '';
                preview.innerHTML = '';
                return;
            }
            
            // Check file type
            if (!file.type.match('image.*')) {
                showNotification('Solo se permiten archivos de imagen', 'danger');
                e.target.value = '';
                preview.innerHTML = '';
                return;
            }
            
            // Show preview
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.innerHTML = `
                    <div class="mt-2">
                        <img src="${e.target.result}" alt="Vista previa" style="max-width: 200px; max-height: 150px; border-radius: 8px; border: 1px solid #ddd;">
                        <div class="form-text mt-1">Imagen seleccionada: ${file.name}</div>
                    </div>
                `;
            };
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML = '';
        }
    });

    document.getElementById('productForm').addEventListener('submit', function(e) {
        e.preventDefault();
        saveProduct();
    });
}

/* ---------------------------
   DASHBOARD DATA
---------------------------- */

async function loadDashboardData() {
    try {
        await loadStats();
        await loadRecentActivity();
        await loadPopularProducts();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
        loadFallbackStats();
        displayEmptyActivity();
        displayEmptyPopularProducts();
    }
}

/* ---------------------------
   STATS
---------------------------- */

async function loadStats() {
    try {
        const response = await fetch('/api/admin/stats', {
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            const stats = await response.json();
            updateStatsDisplay(stats);
        } else if (response.status === 401) {
            // Session expired, redirect to login
            handleAuthError();
        } else {
            loadFallbackStats();
        }
    } catch (error) {
        console.log('Stats API failed, using fallback:', error.message);
        loadFallbackStats();
    }
}

function loadFallbackStats() {
    // Calculate real stats from database
    const stats = {
        totalProducts: products.filter(p => p.status === 'active').length,
        totalOrders: orders.length,
        totalRevenue: orders.reduce((sum, order) => sum + (order.total || 0), 0),
        totalCustomers: new Set(orders.map(order => order.customerEmail)).size
    };
    updateStatsDisplay(stats);
}

function updateStatsDisplay(stats) {
    document.getElementById('totalProducts').textContent = stats.totalProducts;
    document.getElementById('totalOrders').textContent = stats.totalOrders;
    document.getElementById('totalRevenue').textContent = `$${stats.totalRevenue.toFixed(2)}`;
    document.getElementById('totalCustomers').textContent = stats.totalCustomers.toLocaleString();
}

/* ---------------------------
   RECENT ACTIVITY
---------------------------- */

async function loadRecentActivity() {
    try {
        const response = await fetch('/api/admin/activity', {
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            const activities = await response.json();
            displayRecentActivity(activities);
        } else if (response.status === 401) {
            handleAuthError();
        } else {
            displayEmptyActivity();
        }
    } catch (error) {
        console.log('Activity API failed, using fallback:', error.message);
        displayEmptyActivity();
    }
}

function displayEmptyActivity() {
    const container = document.getElementById('recentActivity');
    if (database.activityLog && database.activityLog.length > 0) {
        const recentActivities = database.activityLog.slice(-10).reverse();
        container.innerHTML = recentActivities.map(activity => `
            <tr>
                <td><i class="fas fa-circle text-success me-2"></i>${activity.action}</td>
                <td>${activity.product || 'N/A'}</td>
                <td><span class="badge bg-info">${activity.action}</span></td>
                <td>${formatDate(activity.date)}</td>
            </tr>
        `).join('');
    } else {
        container.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay actividad reciente</td></tr>';
    }
}

function displayRecentActivity(activities) {
    const container = document.getElementById('recentActivity');

    if (!activities || activities.length === 0) {
        displayEmptyActivity();
        return;
    }

    container.innerHTML = activities.map(activity => `
        <tr>
            <td><i class="fas fa-circle text-success me-2"></i>${activity.action}</td>
            <td>${activity.product}</td>
            <td><span class="badge bg-info">${activity.action}</span></td>
            <td>${formatDate(activity.date)}</td>
        </tr>
    `).join('');
}

/* ---------------------------
   POPULAR PRODUCTS
---------------------------- */

async function loadPopularProducts() {
    const container = document.getElementById('popularProducts');

    try {
        const response = await fetch('/api/admin/popular-products', {
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            const popularProducts = await response.json();
            displayPopularProducts(popularProducts);
        } else if (response.status === 401) {
            handleAuthError();
        } else {
            displayEmptyPopularProducts();
        }
    } catch (error) {
        console.log('Popular products API failed, using fallback:', error.message);
        displayEmptyPopularProducts();
    }
}

function displayEmptyPopularProducts() {
    const container = document.getElementById('popularProducts');
    const popularProducts = products
        .filter(p => p.status === 'active')
        .sort((a, b) => (b.sales || 0) - (a.sales || 0))
        .slice(0, 5);
    
    if (popularProducts.length > 0) {
        container.innerHTML = popularProducts.map((product, index) => `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <div class="fw-bold">${product.name}</div>
                    <small class="text-muted">${product.sales || 0} ventas</small>
                </div>
                <div class="text-end">
                    <div class="badge bg-success">#${index + 1}</div>
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<p class="text-muted">No hay datos disponibles</p>';
    }
}

function displayPopularProducts(popularProducts) {
    const container = document.getElementById('popularProducts');

    if (!popularProducts || popularProducts.length === 0) {
        displayEmptyPopularProducts();
        return;
    }

    container.innerHTML = popularProducts.map((product, index) => `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <div class="fw-bold">${product.name}</div>
                <small class="text-muted">${product.sales} ventas</small>
            </div>
            <div class="text-end">
                <div class="badge bg-success">#${index + 1}</div>
            </div>
        </div>
    `).join('');
}

/* ---------------------------
   PRODUCTS
---------------------------- */

async function loadProducts() {
    try {
        const response = await fetch('/api/admin/products', {
            headers: {
                ...getAuthHeaders()
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            products = data.products || []; // Handle paginated response
        } else if (response.status === 401) {
            handleAuthError();
            return;
        } else {
            products = [];
        }
        displayProducts();
    } catch (error) {
        console.log('Admin products API failed, falling back to public API:', error.message);
        
        // Fallback to public API if admin API fails
        try {
            const fallbackResponse = await fetch('/api/products');
            if (fallbackResponse.ok) {
                const data = await fallbackResponse.json();
                products = data.products || []; // Handle paginated response
            } else {
                products = [];
            }
        } catch (fallbackError) {
            products = [];
        }
        displayProducts();
    }
}

function displayProducts() {
    const tbody = document.getElementById('productsTable');

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-light">No hay productos</td></tr>';
        return;
    }

    tbody.innerHTML = products.map(product => `
        <tr>
            <td>
                <img src="${product.image || 'https://picsum.photos/seed/product' + product.id + '/400/300'}" alt="${product.name}" class="product-image-thumb">
            </td>
            <td>
                <div class="fw-bold">${product.name}</div>
                <small class="text-muted">${product.description ? product.description.substring(0, 50) + '...' : 'Sin descripción'}</small>
            </td>
            <td>
                <span class="badge bg-secondary">${product.category}</span>
            </td>
            <td>$${parseFloat(product.price || 0).toFixed(2)}</td>
            <td>
                <span class="${(product.stock || 0) > 0 ? 'text-success' : 'text-danger'}">${product.stock || 0 || 0}</span>
            </td>
            <td>
                <span class="status-badge status-${product.status}">
                    ${product.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-primary btn-action" onclick="editProduct(${product.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger btn-action" onclick="deleteProduct(${product.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

/* ---------------------------
   FILTERS
---------------------------- */

function filterProducts() {
    const searchTerm = document.getElementById('productSearch').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;

    const filteredProducts = products.filter(product => {
        const matchesSearch = product.name.toLowerCase().includes(searchTerm) ||
                              product.description.toLowerCase().includes(searchTerm);
        const matchesCategory = !categoryFilter || product.category === categoryFilter;
        const matchesStatus = !statusFilter || product.status === statusFilter;

        return matchesSearch && matchesCategory && matchesStatus;
    });

    displayFilteredProducts(filteredProducts);
}

function displayFilteredProducts(filteredProducts) {
    const tbody = document.getElementById('productsTable');

    if (filteredProducts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron productos</td></tr>';
        return;
    }

    tbody.innerHTML = filteredProducts.map(product => `
        <tr>
            <td>
                <img src="${product.image || 'https://picsum.photos/seed/product' + product.id + '/400/300'}" alt="${product.name}" class="product-image-thumb">
            </td>
            <td>
                <div class="fw-bold">${product.name}</div>
                <small class="text-muted">${product.description.substring(0, 50)}...</small>
            </td>
            <td>
                <span class="badge bg-secondary">${product.category}</span>
            </td>
            <td>$${parseFloat(product.price || 0).toFixed(2)}</td>
            <td>
                <span class="${(product.stock || 0) > 0 ? 'text-success' : 'text-danger'}">${product.stock || 0}</span>
            </td>
            <td>
                <span class="status-badge status-${product.status}">
                    ${product.status === 'active' ? 'Activo' : 'Inactivo'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-primary btn-action" onclick="editProduct(${product.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger btn-action" onclick="deleteProduct(${product.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

/* ---------------------------
   PRODUCT MODAL
---------------------------- */

function openProductModal() {
    currentEditingProduct = null;
    document.getElementById('productModalTitle').innerHTML = '<i class="fas fa-plus me-2"></i>Añadir Producto';
    document.getElementById('productForm').reset();

    const modal = new bootstrap.Modal(document.getElementById('productModal'));
    modal.show();
}

function editProduct(productId) {
    console.log('Editing product:', productId);
    const product = products.find(p => p.id === productId);
    if (!product) {
        console.error('Product not found:', productId);
        return;
    }

    console.log('Product found:', product);
    currentEditingProduct = product;

    // Fill form fields
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productCategory').value = product.category || '';
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productStock').value = product.stock || 0;
    document.getElementById('productDescription').value = product.description || '';
    
    // Don't set file input value - it's not allowed for security reasons
    // Instead, we'll show the current image name if it exists
    const imageField = document.getElementById('productImage');
    if (imageField && product.image) {
        // Just show the current image name, don't set the file input value
        console.log('Current image:', product.image);
    }
    
    document.getElementById('productStatus').value = product.status;
    
    // Handle featured field safely
    const featuredField = document.getElementById('productFeatured');
    if (featuredField) {
        featuredField.value = product.featured ? 'true' : 'false';
    } else {
        console.warn('productFeatured field not found');
    }

    document.getElementById('productModalTitle').innerHTML = '<i class="fas fa-edit me-2"></i>Editar Producto';

    const modal = new bootstrap.Modal(document.getElementById('productModal'));
    modal.show();
}

/* ---------------------------
   SAVE PRODUCT
---------------------------- */

async function saveProduct() {
    const imageFile = document.getElementById('productImage').files[0];
    const formData = new FormData();
    
    // Add all form fields
    formData.append('name', document.getElementById('productName').value);
    formData.append('category', document.getElementById('productCategory').value);
    formData.append('price', document.getElementById('productPrice').value);
    formData.append('stock', document.getElementById('productStock').value);
    formData.append('description', document.getElementById('productDescription').value);
    formData.append('status', document.getElementById('productStatus').value);
    formData.append('featured', document.getElementById('productFeatured').value);
    
    // Add image file if selected
    if (imageFile) {
        formData.append('productImage', imageFile);
    }

    try {
        let response;
        const headers = getAuthHeaders();

        if (currentEditingProduct) {
            // For updates, we need to handle differently
            const updateData = {
                name: document.getElementById('productName').value,
                category: document.getElementById('productCategory').value,
                price: parseFloat(document.getElementById('productPrice').value),
                stock: parseInt(document.getElementById('productStock').value),
                description: document.getElementById('productDescription').value,
                status: document.getElementById('productStatus').value,
                featured: document.getElementById('productFeatured').value === 'true'
            };
            
            response = await fetch(`/api/admin/products/${currentEditingProduct.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                body: JSON.stringify(updateData)
            });
        } else {
            // For new products, use FormData for file upload
            response = await fetch('/api/admin/products', {
                method: 'POST',
                headers: headers,
                body: formData
            });
        }

        if (response.ok) {
            showNotification('Producto guardado exitosamente', 'success');
            await loadProducts();
            await loadStats();

            const modal = bootstrap.Modal.getInstance(document.getElementById('productModal'));
            modal.hide();
            
            // Reset form
            document.getElementById('productForm').reset();
            document.getElementById('imagePreview').innerHTML = '';
            currentEditingProduct = null;
        } else if (response.status === 401) {
            handleAuthError();
        } else {
            const errorData = await response.json().catch(() => ({}));
            showNotification(errorData.error || 'Error al guardar producto', 'danger');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        showNotification('Error de conexión al guardar producto', 'danger');
    }
}

/* ---------------------------
   DELETE PRODUCT
---------------------------- */

async function deleteProduct(productId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este producto?')) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/products/${productId}`, {
            method: 'DELETE',
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            products = products.filter(p => p.id !== productId);
            displayProducts();
            loadStats();
            showNotification('Producto eliminado exitosamente', 'success');
        } else if (response.status === 401) {
            handleAuthError();
        } else {
            showNotification('Error al eliminar producto', 'danger');
        }
    } catch (error) {
        showNotification('Error de conexión al eliminar producto', 'danger');
    }
}

/* ... rest of the code remains the same ... */
/* ---------------------------
   UI HELPERS
---------------------------- */

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 5000);
}

function showSection(section, el) {
    document.querySelectorAll('.content-section').forEach(sec => {
        sec.style.display = 'none';
    });

    const sectionElement = document.getElementById(section + 'Section');
    if (sectionElement) {
        sectionElement.style.display = 'block';
    }

    document.querySelectorAll('.sidebar-menu .nav-link').forEach(link => {
        link.classList.remove('active');
    });

    if (el) {
        el.classList.add('active');
    }

    // Load section-specific data
    if (section === 'analytics') {
        loadAnalytics();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('show');
}

function logout() {
    if (confirm('¿Estás seguro de que quieres cerrar sesión?')) {
        localStorage.removeItem('adminSession');
        sessionStorage.removeItem('adminSession');
        localStorage.removeItem('adminToken');
        sessionStorage.removeItem('adminToken');
        window.location.href = 'login.html';
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/* ---------------------------
   CATEGORIES MANAGEMENT
---------------------------- */

async function loadCategories() {
    try {
        const response = await fetch('/api/admin/categories', {
            headers: {
                ...getAuthHeaders()
            }
        });
        
        if (response.ok) {
            categories = await response.json();
            displayCategories();
            updateProductCategoryOptions();
        } else if (response.status === 401) {
            handleAuthError();
            return;
        } else {
            categories = [];
        }
    } catch (error) {
        console.log('Admin categories API failed:', error.message);
        categories = [];
        displayCategories();
    }
}

function displayCategories() {
    const tbody = document.getElementById('categoriesTable');

    if (categories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay categorías</td></tr>';
        return;
    }

    tbody.innerHTML = categories.map(category => `
        <tr>
            <td>${category.id}</td>
            <td>
                <div class="fw-bold">${category.name}</div>
            </td>
            <td>${category.description || 'Sin descripción'}</td>
            <td>${formatDate(category.createdAt)}</td>
            <td>
                <button class="btn btn-sm btn-primary btn-action" onclick="editCategory(${category.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-danger btn-action" onclick="deleteCategory(${category.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function openCategoryModal() {
    currentEditingCategory = null;
    
    // Reset form
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryName').value = '';
    document.getElementById('categoryDescription').value = '';
    
    // Update modal title
    document.getElementById('categoryModalTitle').innerHTML = '<i class="fas fa-tags me-2"></i>Añadir Categoría';
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('categoryModal'));
    modal.show();
}

function editCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    currentEditingCategory = category;

    // Fill form
    document.getElementById('categoryId').value = category.id;
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryDescription').value = category.description || '';

    // Update modal title
    document.getElementById('categoryModalTitle').innerHTML = '<i class="fas fa-tags me-2"></i>Editar Categoría';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('categoryModal'));
    modal.show();
}

async function saveCategory() {
    try {
        const categoryId = document.getElementById('categoryId').value;
        const name = document.getElementById('categoryName').value.trim();
        const description = document.getElementById('categoryDescription').value.trim();

        if (!name) {
            showNotification('El nombre de la categoría es requerido', 'error');
            return;
        }

        const categoryData = { name, description };

        let response;
        if (categoryId) {
            // Update existing category
            response = await fetch(`/api/admin/categories/${categoryId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify(categoryData)
            });
        } else {
            // Create new category
            response = await fetch('/api/admin/categories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
                },
                body: JSON.stringify(categoryData)
            });
        }

        if (response.ok) {
            showNotification(categoryId ? 'Categoría actualizada correctamente' : 'Categoría creada correctamente', 'success');
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('categoryModal'));
            modal.hide();
            
            // Reload categories
            await loadCategories();
            
            // Update product form categories
            updateProductCategoryOptions();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Error al guardar la categoría', 'error');
        }
    } catch (error) {
        console.error('Error saving category:', error);
        showNotification('Error al guardar la categoría', 'error');
    }
}

async function deleteCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    if (!confirm(`¿Estás seguro de que quieres eliminar la categoría "${category.name}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/categories/${categoryId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            showNotification('Categoría eliminada correctamente', 'success');
            await loadCategories();
            updateProductCategoryOptions();
        } else {
            const error = await response.json();
            showNotification(error.error || 'Error al eliminar la categoría', 'error');
        }
    } catch (error) {
        console.error('Error deleting category:', error);
        showNotification('Error al eliminar la categoría', 'error');
    }
}

function updateProductCategoryOptions() {
    const categorySelect = document.getElementById('productCategory');
    if (!categorySelect) return;

    // Save current selection
    const currentValue = categorySelect.value;

    // Clear options
    categorySelect.innerHTML = '<option value="">Seleccionar categoría</option>';

    // Add category options
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.name;
        option.textContent = category.name;
        categorySelect.appendChild(option);
    });

    // Restore selection if it still exists
    if (currentValue && categories.some(c => c.name === currentValue)) {
        categorySelect.value = currentValue;
    }
}

async function cleanupImages() {
    if (!confirm('¿Estás seguro de que quieres limpiar las imágenes huérfanas? Esta acción eliminará todas las imágenes que no están asociadas a ningún producto.')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/cleanup-images', {
            method: 'POST',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Cleanup result:', result); // Debug log
            showNotification(result.message || 'Limpieza completada', 'success');
            
            // Show details if files were deleted
            if (result.details && result.details.deletedCount > 0) {
                console.log('Deleted files:', result.details.deletedFiles);
            }
        } else {
            const error = await response.json();
            console.error('Cleanup error:', error);
            showNotification(error.error || 'Error al limpiar imágenes', 'error');
        }
    } catch (error) {
        console.error('Error cleaning up images:', error);
        showNotification('Error al limpiar imágenes', 'error');
    }
}

/* ---------------------------
   ORDERS MANAGEMENT
---------------------------- */

let orders = [];
let currentEditingOrder = null;

async function loadOrders() {
    try {
        const response = await fetch('/api/admin/orders', {
            headers: {
                ...getAuthHeaders()
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            orders = data.orders || [];
        } else if (response.status === 401) {
            handleAuthError();
            return;
        } else {
            orders = [];
        }
        displayOrders();
    } catch (error) {
        console.log('Orders API failed:', error.message);
        orders = [];
        displayOrders();
    }
}

function displayOrders() {
    const tbody = document.getElementById('ordersTable');

    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay pedidos</td></tr>';
        return;
    }

    tbody.innerHTML = orders.map(order => `
        <tr>
            <td>#${order.id}</td>
            <td>
                <div class="fw-bold">${order.customerName}</div>
                <small class="text-muted">${order.customerEmail}</small>
            </td>
            <td>${formatDate(order.createdAt)}</td>
            <td>$${parseFloat(order.total || 0).toFixed(2)}</td>
            <td>
                <span class="status-badge status-${order.status}">
                    ${getOrderStatusText(order.status)}
                </span>
            </td>
            <td>
                <span class="badge bg-${order.paymentStatus === 'paid' ? 'success' : 'warning'}">
                    ${order.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-primary btn-action" onclick="viewOrder(${order.id})">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-success btn-action" onclick="printOrder(${order.id})">
                    <i class="fas fa-print"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function getOrderStatusText(status) {
    const statusMap = {
        'pending': 'Pendiente',
        'processing': 'Procesando',
        'shipped': 'Enviado',
        'delivered': 'Entregado',
        'cancelled': 'Cancelado'
    };
    return statusMap[status] || status;
}

function filterOrders() {
    const searchTerm = document.getElementById('orderSearch').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const dateFilter = document.getElementById('dateFilter').value;
    const paymentFilter = document.getElementById('paymentFilter').value;

    const filteredOrders = orders.filter(order => {
        const matchesSearch = order.id.toString().includes(searchTerm) ||
                              order.customerName.toLowerCase().includes(searchTerm) ||
                              order.customerEmail.toLowerCase().includes(searchTerm);
        const matchesStatus = !statusFilter || order.status === statusFilter;
        const matchesPayment = !paymentFilter || order.paymentStatus === paymentFilter;
        const matchesDate = !dateFilter || isOrderInDateRange(order, dateFilter);

        return matchesSearch && matchesStatus && matchesPayment && matchesDate;
    });

    displayFilteredOrders(filteredOrders);
}

function isOrderInDateRange(order, dateFilter) {
    const orderDate = new Date(order.createdAt);
    const now = new Date();
    
    switch(dateFilter) {
        case 'today':
            return orderDate.toDateString() === now.toDateString();
        case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return orderDate >= weekAgo;
        case 'month':
            return orderDate.getMonth() === now.getMonth() && 
                   orderDate.getFullYear() === now.getFullYear();
        case 'year':
            return orderDate.getFullYear() === now.getFullYear();
        default:
            return true;
    }
}

function displayFilteredOrders(filteredOrders) {
    const tbody = document.getElementById('ordersTable');

    if (filteredOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No se encontraron pedidos</td></tr>';
        return;
    }

    tbody.innerHTML = filteredOrders.map(order => `
        <tr>
            <td>#${order.id}</td>
            <td>
                <div class="fw-bold">${order.customerName}</div>
                <small class="text-muted">${order.customerEmail}</small>
            </td>
            <td>${formatDate(order.createdAt)}</td>
            <td>$${parseFloat(order.total || 0).toFixed(2)}</td>
            <td>
                <span class="status-badge status-${order.status}">
                    ${getOrderStatusText(order.status)}
                </span>
            </td>
            <td>
                <span class="badge bg-${order.paymentStatus === 'paid' ? 'success' : 'warning'}">
                    ${order.paymentStatus === 'paid' ? 'Pagado' : 'Pendiente'}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-primary btn-action" onclick="viewOrder(${order.id})">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-success btn-action" onclick="printOrder(${order.id})">
                    <i class="fas fa-print"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function viewOrder(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    currentEditingOrder = order;

    const orderDetails = document.getElementById('orderDetails');
    orderDetails.innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h6>Información del Cliente</h6>
                <p><strong>Nombre:</strong> ${order.customerName}</p>
                <p><strong>Email:</strong> ${order.customerEmail}</p>
                <p><strong>Teléfono:</strong> ${order.customerPhone || 'N/A'}</p>
                <p><strong>Dirección:</strong> ${order.shippingAddress || 'N/A'}</p>
            </div>
            <div class="col-md-6">
                <h6>Información del Pedido</h6>
                <p><strong>ID:</strong> #${order.id}</p>
                <p><strong>Fecha:</strong> ${formatDate(order.createdAt)}</p>
                <p><strong>Total:</strong> $${parseFloat(order.total || 0).toFixed(2)}</p>
                <p><strong>Método de Pago:</strong> ${order.paymentMethod || 'N/A'}</p>
            </div>
        </div>
        
        <hr>
        
        <h6>Estado del Pedido</h6>
        <div class="mb-3">
            <select class="form-select" id="orderStatusSelect">
                <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Procesando</option>
                <option value="shipped" ${order.status === 'shipped' ? 'selected' : ''}>Enviado</option>
                <option value="delivered" ${order.status === 'delivered' ? 'selected' : ''}>Entregado</option>
                <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelado</option>
            </select>
        </div>
        
        <div class="mb-3">
            <label for="trackingNumber" class="form-label">Número de Seguimiento</label>
            <input type="text" class="form-control" id="trackingNumber" value="${order.trackingNumber || ''}" placeholder="Introduce el número de seguimiento">
        </div>
        
        <h6>Productos del Pedido</h6>
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Precio</th>
                        <th>Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${(order.items || []).map(item => `
                        <tr>
                            <td>${item.name}</td>
                            <td>${item.quantity}</td>
                            <td>$${parseFloat(item.price || 0).toFixed(2)}</td>
                            <td>$${parseFloat(item.quantity * item.price || 0).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById('orderModal'));
    modal.show();
}

async function updateOrderStatus() {
    if (!currentEditingOrder) return;

    const newStatus = document.getElementById('orderStatusSelect').value;
    const trackingNumber = document.getElementById('trackingNumber').value;

    try {
        const response = await fetch(`/api/admin/orders/${currentEditingOrder.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({
                status: newStatus,
                trackingNumber: trackingNumber
            })
        });

        if (response.ok) {
            showNotification('Estado del pedido actualizado', 'success');
            await loadOrders();
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('orderModal'));
            modal.hide();
            currentEditingOrder = null;
        } else {
            showNotification('Error al actualizar el estado', 'danger');
        }
    } catch (error) {
        console.error('Error updating order:', error);
        showNotification('Error de conexión', 'danger');
    }
}

function printOrder(orderId) {
    window.open(`/api/admin/orders/${orderId}/print`, '_blank');
}

function refreshOrders() {
    loadOrders();
}

async function exportOrders() {
    try {
        const response = await fetch('/api/admin/orders/export', {
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `orders_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showNotification('Pedidos exportados correctamente', 'success');
        } else {
            showNotification('Error al exportar pedidos', 'danger');
        }
    } catch (error) {
        console.error('Error exporting orders:', error);
        showNotification('Error de conexión', 'danger');
    }
}

/* ---------------------------
   ANALYTICS FUNCTIONS
---------------------------- */

let salesChart = null;

async function loadAnalytics() {
    try {
        const response = await fetch('/api/admin/analytics', {
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            const data = await response.json();
            updateAnalyticsDisplay(data);
        } else if (response.status === 401) {
            handleAuthError();
        } else {
            loadFallbackAnalytics();
        }
    } catch (error) {
        console.log('Analytics API failed:', error.message);
        loadFallbackAnalytics();
    }
}

function loadFallbackAnalytics() {
    // Calculate real stats from orders data
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    // Filter orders from current month
    const monthOrders = orders.filter(order => {
        const orderDate = new Date(order.date);
        return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
    });
    
    // Calculate sales data for chart (daily sales this month)
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const salesData = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dayOrders = monthOrders.filter(order => {
            const orderDate = new Date(order.date);
            return orderDate.getDate() === day;
        });
        
        salesData.push({
            date: new Date(currentYear, currentMonth, day),
            sales: dayOrders.reduce((sum, order) => sum + (order.total || 0), 0)
        });
    }
    
    // Calculate customer stats
    const customerEmails = orders.map(order => order.customerEmail);
    const uniqueCustomers = [...new Set(customerEmails)];
    const customerCounts = {};
    
    customerEmails.forEach(email => {
        customerCounts[email] = (customerCounts[email] || 0) + 1;
    });
    
    const newCustomers = uniqueCustomers.filter(email => customerCounts[email] === 1).length;
    const returningCustomers = uniqueCustomers.filter(email => customerCounts[email] > 1).length;
    
    updateAnalyticsDisplay({
        salesData: salesData,
        totalSales: monthOrders.length,
        totalRevenue: monthOrders.reduce((sum, order) => sum + (order.total || 0), 0),
        newCustomers: newCustomers,
        returningCustomers: returningCustomers
    });
}

function updateAnalyticsDisplay(data) {
    // Update summary stats
    document.getElementById('totalSales').textContent = data.totalSales;
    document.getElementById('totalRevenue').textContent = `$${data.totalRevenue.toFixed(2)}`;
    
    // Update customer analytics
    document.getElementById('newCustomers').textContent = data.newCustomers;
    document.getElementById('returningCustomers').textContent = data.returningCustomers;
    
    // Update sales chart
    updateSalesChart(data.salesData);
}

function updateSalesChart(salesData) {
    const canvas = document.getElementById('salesChart');
    if (!canvas) {
        console.error('salesChart canvas not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2d context for salesChart');
        return;
    }
    
    if (salesChart) {
        salesChart.destroy();
    }
    
    // Create chart even with empty data to show proper visualization
    if (!salesData || salesData.length === 0) {
        console.log('No sales data available, showing empty chart');
        salesData = [];
    }
    
    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: salesData.length > 0 ? salesData.map(d => formatDate(d.date)) : ['No hay datos'],
            datasets: [{
                label: 'Ventas',
                data: salesData.length > 0 ? salesData.map(d => d.sales) : [0],
                borderColor: salesData.length > 0 ? 'rgb(75, 192, 192)' : 'rgba(200, 200, 200, 1)',
                backgroundColor: salesData.length > 0 ? 'rgba(75, 192, 192, 0.2)' : 'rgba(200, 200, 200, 0.2)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toFixed(0);
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    display: salesData.length > 0
                },
                title: {
                    display: salesData.length === 0,
                    text: 'No hay datos de ventas disponibles',
                    color: '#666'
                }
            }
        }
    });
}

function refreshAnalytics() {
    loadAnalytics();
}

/* ---------------------------
   SETTINGS FUNCTIONS
---------------------------- */

async function loadSettings() {
    try {
        const response = await fetch('/api/admin/settings', {
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            const settings = await response.json();
            populateSettingsForm(settings);
        } else if (response.status === 401) {
            handleAuthError();
        }
    } catch (error) {
        console.log('Settings API failed:', error.message);
    }
}

function populateSettingsForm(settings) {
    // General settings
    document.getElementById('storeName').value = settings.storeName || '';
    document.getElementById('storeEmail').value = settings.storeEmail || '';
    document.getElementById('storePhone').value = settings.storePhone || '';
    document.getElementById('storeAddress').value = settings.storeAddress || '';
    document.getElementById('storeCurrency').value = settings.storeCurrency || 'EUR';
    
    // Notification settings
    document.getElementById('emailNotifications').checked = settings.emailNotifications !== false;
    document.getElementById('lowStockAlert').checked = settings.lowStockAlert !== false;
    document.getElementById('adminEmail').value = settings.adminEmail || '';
    document.getElementById('lowStockThreshold').value = settings.lowStockThreshold || 5;
    
    // Payment settings
    document.getElementById('enableStripe').checked = settings.enableStripe !== false;
    document.getElementById('stripePublicKey').value = settings.stripePublicKey || '';
    document.getElementById('enablePayPal').checked = settings.enablePayPal || false;
    document.getElementById('paypalEmail').value = settings.paypalEmail || '';
    
    // Shipping settings
    document.getElementById('freeShippingThreshold').value = settings.freeShippingThreshold || 50;
    document.getElementById('standardShippingCost').value = settings.standardShippingCost || 4.99;
    document.getElementById('expressShippingCost').value = settings.expressShippingCost || 9.99;
    document.getElementById('enableInternationalShipping').checked = settings.enableInternationalShipping || false;
}

async function saveAllSettings() {
    try {
        const settings = {
            // General settings
            storeName: document.getElementById('storeName').value,
            storeEmail: document.getElementById('storeEmail').value,
            storePhone: document.getElementById('storePhone').value,
            storeAddress: document.getElementById('storeAddress').value,
            storeCurrency: document.getElementById('storeCurrency').value,
            
            // Notification settings
            emailNotifications: document.getElementById('emailNotifications').checked,
            lowStockAlert: document.getElementById('lowStockAlert').checked,
            adminEmail: document.getElementById('adminEmail').value,
            lowStockThreshold: parseInt(document.getElementById('lowStockThreshold').value),
            
            // Payment settings
            enableStripe: document.getElementById('enableStripe').checked,
            stripePublicKey: document.getElementById('stripePublicKey').value,
            enablePayPal: document.getElementById('enablePayPal').checked,
            paypalEmail: document.getElementById('paypalEmail').value,
            
            // Shipping settings
            freeShippingThreshold: parseFloat(document.getElementById('freeShippingThreshold').value),
            standardShippingCost: parseFloat(document.getElementById('standardShippingCost').value),
            expressShippingCost: parseFloat(document.getElementById('expressShippingCost').value),
            enableInternationalShipping: document.getElementById('enableInternationalShipping').checked
        };

        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(settings)
        });

        if (response.ok) {
            showNotification('Configuración guardada correctamente', 'success');
        } else {
            showNotification('Error al guardar la configuración', 'danger');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification('Error de conexión', 'danger');
    }
}

async function backupDatabase() {
    if (!confirm('¿Estás seguro de que quieres crear un respaldo de la base de datos?')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/backup', {
            method: 'POST',
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            const result = await response.json();
            showNotification(result.message || 'Respaldo creado correctamente', 'success');
        } else {
            showNotification('Error al crear el respaldo', 'danger');
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        showNotification('Error de conexión', 'danger');
    }
}

async function clearCache() {
    if (!confirm('¿Estás seguro de que quieres limpiar la caché del sistema?')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/clear-cache', {
            method: 'POST',
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            showNotification('Caché limpiada correctamente', 'success');
        } else {
            showNotification('Error al limpiar la caché', 'danger');
        }
    } catch (error) {
        console.error('Error clearing cache:', error);
        showNotification('Error de conexión', 'danger');
    }
}

async function exportData() {
    try {
        const response = await fetch('/api/admin/export-data', {
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `store_data_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showNotification('Datos exportados correctamente', 'success');
        } else {
            showNotification('Error al exportar datos', 'danger');
        }
    } catch (error) {
        console.error('Error exporting data:', error);
        showNotification('Error de conexión', 'danger');
    }
}

async function resetSettings() {
    if (!confirm('¿Estás seguro de que quieres restablecer toda la configuración a los valores predeterminados? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        const response = await fetch('/api/admin/reset-settings', {
            method: 'POST',
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            showNotification('Configuración restablecida correctamente', 'success');
            loadSettings(); // Reload default settings
        } else {
            showNotification('Error al restablecer la configuración', 'danger');
        }
    } catch (error) {
        console.error('Error resetting settings:', error);
        showNotification('Error de conexión', 'danger');
    }
}

/* ---------------------------
   UTILITY FUNCTIONS
---------------------------- */

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

function formatCurrency(amount, currency = 'EUR') {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

function formatNumber(num) {
    return new Intl.NumberFormat('es-ES').format(num);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    const re = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;
    return re.test(phone);
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

function getStatusColor(status) {
    const colors = {
        'pending': 'warning',
        'processing': 'info',
        'shipped': 'primary',
        'delivered': 'success',
        'cancelled': 'danger',
        'active': 'success',
        'inactive': 'secondary'
    };
    return colors[status] || 'secondary';
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Copiado al portapapeles', 'success');
    }).catch(() => {
        showNotification('Error al copiar', 'danger');
    });
}

function downloadFile(content, filename, type = 'text/plain') {
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function showLoadingSpinner(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = '<div class="text-center"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Cargando...</span></div></div>';
    }
}

function hideLoadingSpinner(elementId, content = '') {
    const element = document.getElementById(elementId);
    if (element) {
        element.innerHTML = content;
    }
}

function confirmAction(message, callback) {
    if (confirm(message)) {
        callback();
    }
}

function getRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `hace ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'hace unos segundos';
}

function animateNumber(elementId, targetValue, duration = 1000) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const startValue = 0;
    const increment = targetValue / (duration / 16);
    let currentValue = startValue;

    const timer = setInterval(() => {
        currentValue += increment;
        if (currentValue >= targetValue) {
            currentValue = targetValue;
            clearInterval(timer);
        }
        element.textContent = formatNumber(Math.floor(currentValue));
    }, 16);
}

/* ---------------------------
   KEYBOARD SHORTCUTS
---------------------------- */

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            // Check which modal is open and save accordingly
            const productModal = document.getElementById('productModal');
            const categoryModal = document.getElementById('categoryModal');
            
            if (productModal.classList.contains('show')) {
                saveProduct();
            } else if (categoryModal.classList.contains('show')) {
                saveCategory();
            }
        }

        // Escape to close modals
        if (e.key === 'Escape') {
            const openModals = document.querySelectorAll('.modal.show');
            openModals.forEach(modal => {
                const modalInstance = bootstrap.Modal.getInstance(modal);
                if (modalInstance) {
                    modalInstance.hide();
                }
            });
        }

        // Ctrl/Cmd + K for search (when not in input)
        if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            const productSearch = document.getElementById('productSearch');
            if (productSearch && document.getElementById('productsSection').style.display !== 'none') {
                productSearch.focus();
            }
        }
    });
}

/* ---------------------------
   PERFORMANCE OPTIMIZATIONS
---------------------------- */

function optimizeTableScrolling() {
    const tables = document.querySelectorAll('.table-responsive');
    tables.forEach(table => {
        let isDown = false;
        let startX;
        let scrollLeft;

        table.addEventListener('mousedown', (e) => {
            isDown = true;
            startX = e.pageX - table.offsetLeft;
            scrollLeft = table.scrollLeft;
        });

        table.addEventListener('mouseleave', () => {
            isDown = false;
        });

        table.addEventListener('mouseup', () => {
            isDown = false;
        });

        table.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - table.offsetLeft;
            const walk = (x - startX) * 2;
            table.scrollLeft = scrollLeft - walk;
        });
    });
}

function setupLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                observer.unobserve(img);
            }
        });
    });

    images.forEach(img => imageObserver.observe(img));
}

/* ---------------------------
   INITIALIZATION ENHANCEMENTS
---------------------------- */

function initializeEnhancements() {
    setupKeyboardShortcuts();
    optimizeTableScrolling();
    setupLazyLoading();
    
    // Add smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

/* ---------------------------
   REAL-TIME UPDATES
---------------------------- */

function setupRealTimeUpdates() {
    setInterval(() => {
        loadStats();
        loadRecentActivity();
    }, 30000);
}
