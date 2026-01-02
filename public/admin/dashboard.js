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
    setupEventListeners();
    setupRealTimeUpdates();
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
    const stats = {
        totalProducts: products.length || 0,
        totalOrders: 0,
        totalRevenue: 0.00,
        totalCustomers: 0
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
    container.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay actividad reciente</td></tr>';
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
    container.innerHTML = '<p class="text-muted">No hay datos disponibles</p>';
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
   REAL-TIME UPDATES
---------------------------- */

function setupRealTimeUpdates() {
    setInterval(() => {
        loadStats();
        loadRecentActivity();
    }, 30000);
}
