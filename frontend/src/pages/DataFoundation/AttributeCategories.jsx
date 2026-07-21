import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  RotateCcw,
  AlertTriangle,
  X,
  Layers
} from 'lucide-react';
import Breadcrumb from '../../components/Breadcrumb/Breadcrumb';
import DashboardCard from '../../components/DashboardCard/DashboardCard';
import {
  getAttributeCategories,
  createAttributeCategory,
  updateAttributeCategory,
  deleteAttributeCategory
} from '../../services/dashboardService';
import './AttributeCategories.css';

const INITIAL_FORM_STATE = {
  category_name: '',
  description: ''
};

const AttributeCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [searchInput, setSearchInput] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editCategoryId, setEditCategoryId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [formBannerError, setFormBannerError] = useState(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteCategory, setDeleteCategory] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const data = await getAttributeCategories();
      setCategories(data || []);
    } catch (err) {
      console.error('Failed to load attribute categories:', err);
      setErrorMsg('Failed to load attribute categories. Please check backend connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const filteredCategories = categories.filter((c) => {
    if (!searchInput.trim()) return true;
    const term = searchInput.toLowerCase();
    return (
      c.category_name.toLowerCase().includes(term) ||
      (c.description || '').toLowerCase().includes(term)
    );
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
    setFormBannerError(null);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.category_name || !formData.category_name.trim()) {
      errors.category_name = 'Category Name is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenAddModal = () => {
    setEditCategoryId(null);
    setFormData(INITIAL_FORM_STATE);
    setFormErrors({});
    setFormBannerError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (category) => {
    setEditCategoryId(category.id);
    setFormData({
      category_name: category.category_name,
      description: category.description || ''
    });
    setFormErrors({});
    setFormBannerError(null);
    setShowModal(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSubmitting(true);
      setFormBannerError(null);

      if (editCategoryId) {
        await updateAttributeCategory(editCategoryId, formData);
      } else {
        await createAttributeCategory(formData);
      }

      setShowModal(false);
      fetchCategories();
    } catch (err) {
      console.error(err);
      setFormBannerError(err.response?.data?.detail || 'Failed to save category. Please check fields.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDeleteConfirm = (category) => {
    setDeleteCategory(category);
    setDeleteError(null);
    setShowDeleteConfirm(true);
  };

  const handleDeleteSubmit = async () => {
    if (!deleteCategory) return;
    try {
      setSubmitting(true);
      setDeleteError(null);
      await deleteAttributeCategory(deleteCategory.id);
      setShowDeleteConfirm(false);
      setDeleteCategory(null);
      fetchCategories();
    } catch (err) {
      console.error(err);
      setDeleteError(err.response?.data?.detail || 'Failed to delete category. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="attribute-categories-page">
      <Breadcrumb items={[
        { label: 'Data Foundation', active: false },
        { label: 'Attribute Categories', active: true }
      ]} />

      <div className="page-header-actions">
        <div className="header-title-section">
          <h2>Attribute Categories</h2>
          <p>Organize identity, account, entitlement, and role attributes into logical groups.</p>
        </div>
        <div className="header-buttons-section">
          <button className="btn-add-attribute" onClick={handleOpenAddModal}>
            <Plus size={14} />
            <span>Add Category</span>
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <DashboardCard title="Total Categories" value={categories.length} icon={Layers} color="blue" loading={loading} />
      </div>

      <div className="controls-card">
        <div className="search-input-wrapper">
          <Search size={16} className="text-muted" />
          <input
            type="text"
            className="search-field"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by category name or description..."
          />
        </div>
        {searchInput && (
          <button className="btn-reset-filters" onClick={() => setSearchInput('')}>
            <RotateCcw size={13} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Reset
          </button>
        )}
      </div>

      <div className="table-card">
        {errorMsg && <div className="error-banner" style={{ margin: '16px 24px' }}>{errorMsg}</div>}

        {loading ? (
          <div className="table-loading-container">
            <div className="spinner-element"></div>
            <p className="text-muted" style={{ fontSize: '13px' }}>Loading categories...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="table-empty-container">
            <div className="delete-dialog-icon" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              <Layers size={22} />
            </div>
            <div className="empty-state-text">
              <h4>No categories found</h4>
              <p>Click 'Add Category' to create a new attribute grouping.</p>
            </div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Category Name</th>
                  <th>Description</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.map((cat) => (
                  <tr key={cat.id}>
                    <td style={{ fontWeight: 600 }}>{cat.category_name}</td>
                    <td className="text-muted">{cat.description || '—'}</td>
                    <td>{cat.created_by || 'System'}</td>
                    <td>
                      <div className="actions-cell-menu">
                        <button className="btn-row-action" onClick={() => handleOpenEditModal(cat)} title="Edit Category">
                          <Edit size={13} />
                        </button>
                        <button className="btn-row-action delete" onClick={() => handleOpenDeleteConfirm(cat)} title="Delete Category">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom">
            <div className="modal-header-custom">
              <h3>{editCategoryId ? 'Edit Category' : 'Add Attribute Category'}</h3>
              <button className="modal-close-btn-custom" onClick={() => setShowModal(false)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="modal-form-custom">
              <div className="modal-scrollable-body">
                {formBannerError && <div className="modal-form-banner-error">{formBannerError}</div>}

                <div className="input-group-custom">
                  <label className="required">Category Name</label>
                  <input
                    type="text"
                    name="category_name"
                    value={formData.category_name}
                    onChange={handleInputChange}
                    placeholder="e.g. Compliance"
                  />
                  {formErrors.category_name && <span className="form-error-text">{formErrors.category_name}</span>}
                </div>

                <div className="input-group-custom">
                  <label>Description</label>
                  <textarea
                    name="description"
                    rows="3"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Briefly describe what kinds of attributes belong in this category..."
                    style={{
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-main)',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      fontSize: '13.5px',
                      fontFamily: 'inherit',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              <div className="modal-footer-custom">
                <button type="button" className="btn-modal-cancel" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && deleteCategory && (
        <div className="modal-overlay-custom">
          <div className="modal-content-custom delete-dialog-content">
            <div className="delete-dialog-body">
              <div className="delete-dialog-icon">
                <AlertTriangle size={24} />
              </div>
              <div className="delete-dialog-text">
                <h4>Delete Category</h4>
                <p>
                  Are you sure you want to delete <b>{deleteCategory.category_name}</b>? This can only be
                  done if no attributes currently use this category.
                </p>
              </div>
            </div>
            {deleteError && (
              <div className="modal-form-banner-error" style={{ margin: '0 24px 16px' }}>
                {deleteError}
              </div>
            )}
            <div className="modal-footer-custom">
              <button className="btn-modal-cancel" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="btn-modal-delete" onClick={handleDeleteSubmit} disabled={submitting}>
                {submitting ? 'Deleting...' : 'Delete Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttributeCategories;