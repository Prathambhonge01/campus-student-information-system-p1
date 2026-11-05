import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { request } from './api.js';
import { Icons } from './Icons.jsx';

const emptyStudent = {
  studentId: '',
  name: '',
  email: '',
  department: '',
  section: '',
  semester: '',
  contact: ''
};

// Deterministic pleasing avatar color based on name/id
const AVATAR_PALETTES = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #ec4899, #f43f5e)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #06b6d4, #0284c7)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #8b5cf6, #d946ef)',
  'linear-gradient(135deg, #14b8a6, #0d9488)',
  'linear-gradient(135deg, #f97316, #ea580c)'
];

function getAvatarStyle(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_PALETTES.length;
  return { background: AVATAR_PALETTES[index] };
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/);
  if (!parts.length || !parts[0]) return '?';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function App() {
  const [page, setPage] = useState('overview');
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toasts, setToasts] = useState([]);

  // Filters & Controls
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'

  // Modals
  const [form, setForm] = useState(null); // student or department form
  const [detailStudent, setDetailStudent] = useState(null); // view details modal
  const [confirmDialog, setConfirmDialog] = useState(null); // custom delete confirmation
  const [saving, setSaving] = useState(false);

  // Theme & UI state
  const [theme, setTheme] = useState(() => localStorage.getItem('campusdesk_theme') || 'dark');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Sync theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('campusdesk_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  };

  // Toast notification manager
  const addToast = useCallback((message, type = 'success', title = '') => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    const newToast = {
      id,
      message,
      type,
      title: title || (type === 'error' ? 'Notice' : type === 'warning' ? 'Warning' : 'Success')
    };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3800);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Scroll listener for back-to-top button
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 280);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Load data
  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [s, d] = await Promise.all([request('/api/students'), request('/api/departments')]);
      setStudents(s.data || []);
      setDepartments(d.data || []);
      if (isRefresh) addToast('Data synchronized successfully', 'info', 'Refreshed');
    } catch (e) {
      addToast(e.message, 'error', 'Network Connection Error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Keyboard shortcut (Escape closes open modals)
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !saving) {
        if (confirmDialog) setConfirmDialog(null);
        else if (detailStudent) setDetailStudent(null);
        else if (form) setForm(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saving, confirmDialog, detailStudent, form]);

  // Department counts
  const counts = useMemo(() => {
    const m = {};
    students.forEach((s) => {
      const id = s.department?._id;
      if (id) m[id] = (m[id] || 0) + 1;
    });
    return m;
  }, [students]);

  // Filtered & Sorted students
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = students.filter((s) => {
      const matchDept = !deptFilter || s.department?._id === deptFilter;
      const matchSem = !semesterFilter || String(s.semester) === String(semesterFilter);
      const matchQuery =
        !q ||
        [s.studentId, s.name, s.email, s.department?.name, s.section, s.contact]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      return matchDept && matchSem && matchQuery;
    });

    return filtered.sort((a, b) => {
      let valA = '';
      let valB = '';
      if (sortBy === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (sortBy === 'studentId') {
        valA = a.studentId.toLowerCase();
        valB = b.studentId.toLowerCase();
      } else if (sortBy === 'department') {
        valA = (a.department?.name || '').toLowerCase();
        valB = (b.department?.name || '').toLowerCase();
      } else if (sortBy === 'semester') {
        valA = Number(a.semester) || 0;
        valB = Number(b.semester) || 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [students, query, deptFilter, semesterFilter, sortBy, sortOrder]);

  // Copy ID to clipboard with checkmark feedback
  const handleCopyId = (id, e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    addToast(`Copied "${id}" to clipboard`, 'info', 'Copied');
    setTimeout(() => {
      setCopiedId(null);
    }, 2000);
  };

  // CSV Export
  const handleExportCSV = () => {
    if (!visible.length) {
      addToast('No student records to export.', 'warning');
      return;
    }
    const headers = ['Student ID', 'Full Name', 'Email', 'Department', 'Section', 'Semester', 'Phone'];
    const rows = visible.map((s) => [
      `"${s.studentId || ''}"`,
      `"${(s.name || '').replace(/"/g, '""')}"`,
      `"${s.email || ''}"`,
      `"${s.department?.name || ''}"`,
      `"${s.section || ''}"`,
      s.semester || '',
      `"${s.contact || ''}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `campusdesk_students_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast(`Exported ${visible.length} student records to CSV.`, 'success');
  };

  // Modals open handlers
  const openStudentForm = (student = null) => {
    setDetailStudent(null);
    setForm({
      type: 'student',
      student,
      formError: '',
      values: student
        ? {
          studentId: student.studentId,
          name: student.name,
          email: student.email,
          department: student.department?._id || '',
          section: student.section,
          semester: String(student.semester),
          contact: student.contact || ''
        }
        : {
          ...emptyStudent,
          department: deptFilter || departments[0]?._id || ''
        }
    });
  };

  const openDepartmentForm = (department = null) => {
    setForm({
      type: 'department',
      department,
      formError: '',
      values: {
        name: department?.name || '',
        sections: department ? department.sections.join(', ') : ''
      }
    });
  };

  const setField = (key, val, extra = {}) => {
    setForm((f) => ({
      ...f,
      values: { ...f.values, [key]: val, ...extra }
    }));
  };

  // Form submission
  const submitForm = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { type, student, department, values } = form;
      if (type === 'student') {
        const path = student
          ? `/api/students/${encodeURIComponent(student.studentId)}`
          : '/api/students';
        await request(path, {
          method: student ? 'PUT' : 'POST',
          body: JSON.stringify({ ...values, semester: Number(values.semester) })
        });
        addToast(
          student ? `Updated record for ${values.name}` : `Added student ${values.name}`,
          'success'
        );
      } else {
        const sections = [
          ...new Set(values.sections.split(',').map((s) => s.trim()).filter(Boolean))
        ];
        await request(department ? `/api/departments/${department._id}` : '/api/departments', {
          method: department ? 'PUT' : 'POST',
          body: JSON.stringify({ name: values.name, sections })
        });
        addToast(
          department ? `Department "${values.name}" updated` : `Department "${values.name}" created`,
          'success'
        );
      }
      setForm(null);
      await loadData();
    } catch (err) {
      setForm((f) => ({ ...f, formError: err.message }));
    } finally {
      setSaving(false);
    }
  };

  // Custom Delete Confirmation Modal
  const requestRemove = (kind, item) => {
    setConfirmDialog({
      kind,
      item,
      title: kind === 'student' ? 'Delete Student Record' : 'Delete Department',
      message:
        kind === 'student'
          ? `Are you sure you want to permanently delete "${item.name}" (${item.studentId})? This action cannot be undone.`
          : `Are you sure you want to delete department "${item.name}"? This department cannot be deleted if students are currently enrolled.`
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDialog) return;
    const { kind, item } = confirmDialog;
    setSaving(true);
    try {
      await request(
        kind === 'student'
          ? `/api/students/${encodeURIComponent(item.studentId)}`
          : `/api/departments/${item._id}`,
        { method: 'DELETE' }
      );
      addToast(`Deleted ${item.name}`, 'success');
      setConfirmDialog(null);
      if (detailStudent?._id === item._id) setDetailStudent(null);
      await loadData();
    } catch (e) {
      addToast(e.message, 'error', 'Delete Failed');
    } finally {
      setSaving(false);
    }
  };

  // Stats computation
  const sectionsTotal = useMemo(
    () => departments.reduce((acc, d) => acc + (d.sections?.length || 0), 0),
    [departments]
  );
  const semestersTotal = useMemo(
    () => new Set(students.map((s) => s.semester).filter(Boolean)).size,
    [students]
  );

  const formSections = useMemo(() => {
    return departments.find((d) => d._id === form?.values?.department)?.sections || [];
  }, [departments, form?.values?.department]);

  const navPages = [
    { key: 'overview', label: 'Overview', icon: Icons.LayoutGrid, count: null },
    { key: 'students', label: 'Students', icon: Icons.Users, count: students.length },
    { key: 'departments', label: 'Departments', icon: Icons.Building2, count: departments.length }
  ];

  return (
    <div className="app-wrapper">
      {/* Sticky Glassmorphic Header */}
      <header className="sticky-top-header">
        <div className="header-container">
          <div
            className="brand-group"
            onClick={() => {
              setPage('overview');
              scrollToTop();
            }}
          >
            <div className="brand-icon-wrapper">
              <Icons.GraduationCap size={22} />
            </div>
            <div className="brand-title">
              CampusDesk
              <span className="brand-badge">SIS</span>
            </div>
          </div>

          <nav className="main-nav" aria-label="Main Navigation">
            {navPages.map(({ key, label, icon: NavIcon, count }) => (
              <button
                key={key}
                className={`nav-tab-btn ${page === key ? 'active' : ''}`}
                onClick={() => {
                  if (key === 'students') {
                    setDeptFilter('');
                    setQuery('');
                  }
                  setPage(key);
                  scrollToTop();
                }}
              >
                <NavIcon size={16} />
                <span>{label}</span>
                {count !== null && <span className="nav-count-badge">{count}</span>}
              </button>
            ))}
          </nav>

          <div className="header-actions">
            <div className="status-pill" title="Backend API status">
              <span className="status-dot" />
              <span>Atlas Connected</span>
            </div>

            <button
              className="icon-btn"
              title="Refresh Data"
              onClick={() => loadData(true)}
              disabled={refreshing}
            >
              <Icons.RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>

            <button
              className="icon-btn"
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Icons.Sun size={17} /> : <Icons.Moon size={17} />}
            </button>

            <button
              className="btn primary sm"
              onClick={() => openStudentForm()}
              disabled={!departments.length}
            >
              <Icons.Plus size={16} />
              <span>Add Student</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content View */}
      <main className="content-area">
        {/* OVERVIEW PAGE */}
        {page === 'overview' && (
          <div>
            <div className="hero-welcome-card">
              <div>
                <h2 className="hero-welcome-title">Campus Overview & Insights</h2>
                <p className="hero-welcome-sub">
                  Unified dashboard for student demographics, departmental divisions, and section allocations across the campus database.
                </p>
              </div>
              <div className="action-bar-group">
                <button
                  className="btn primary"
                  onClick={() => openStudentForm()}
                  disabled={!departments.length}
                >
                  <Icons.Plus size={16} />
                  <span>Enroll Student</span>
                </button>
                <button
                  className="btn"
                  onClick={() => openDepartmentForm()}
                >
                  <Icons.Building2 size={16} />
                  <span>Add Department</span>
                </button>
              </div>
            </div>

            {/* Stat Cards */}
            <div className="stats-grid">
              <div className="stat-card" onClick={() => setPage('students')} style={{ cursor: 'pointer' }}>
                <div className="stat-card-header">
                  <span className="stat-title">Total Enrolled</span>
                  <div className="stat-icon-pill indigo">
                    <Icons.Users size={20} />
                  </div>
                </div>
                <div>
                  <div className="stat-value">{loading ? '—' : students.length}</div>
                  <div className="stat-meta-trend">
                    <Icons.Sparkles size={13} />
                    <span>Active student profiles</span>
                  </div>
                </div>
              </div>

              <div className="stat-card" onClick={() => setPage('departments')} style={{ cursor: 'pointer' }}>
                <div className="stat-card-header">
                  <span className="stat-title">Departments</span>
                  <div className="stat-icon-pill emerald">
                    <Icons.Building2 size={20} />
                  </div>
                </div>
                <div>
                  <div className="stat-value">{loading ? '—' : departments.length}</div>
                  <div className="stat-meta-trend">
                    <span>Academic faculties</span>
                  </div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">Active Sections</span>
                  <div className="stat-icon-pill cyan">
                    <Icons.Layers size={20} />
                  </div>
                </div>
                <div>
                  <div className="stat-value">{loading ? '—' : sectionsTotal}</div>
                  <div className="stat-meta-trend">
                    <span>Classroom divisions</span>
                  </div>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-header">
                  <span className="stat-title">Semesters</span>
                  <div className="stat-icon-pill amber">
                    <Icons.Calendar size={20} />
                  </div>
                </div>
                <div>
                  <div className="stat-value">{loading ? '—' : semestersTotal}</div>
                  <div className="stat-meta-trend">
                    <span>Active terms</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Department Headcount Quick Summary */}
            {departments.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <div className="section-header" style={{ marginBottom: '14px' }}>
                  <div className="header-text-group">
                    <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Department Breakdown</h3>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '14px' }}>
                  {departments.map((dept) => {
                    const count = counts[dept._id] || 0;
                    const pct = students.length ? Math.round((count / students.length) * 100) : 0;
                    return (
                      <div
                        key={dept._id}
                        className="stat-card"
                        style={{ padding: '16px', cursor: 'pointer' }}
                        onClick={() => {
                          setDeptFilter(dept._id);
                          setPage('students');
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '14px' }}>{dept.name}</span>
                          <span className="pill-badge count">{count} students</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'var(--line)', borderRadius: '999px', overflow: 'hidden', marginTop: '10px' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, var(--primary), var(--cyan))', borderRadius: '999px', transition: 'width 0.5s ease' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-subtle)', marginTop: '4px' }}>
                          <span>{dept.sections.length} sections ({dept.sections.join(', ') || 'None'})</span>
                          <span>{pct}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Students */}
            <div className="section-header">
              <div className="header-text-group">
                <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Recently Enrolled Students</h3>
                <p>Latest additions to the campus database</p>
              </div>
              {students.length > 5 && (
                <button className="btn sm" onClick={() => setPage('students')}>
                  <span>View All {students.length} Students</span>
                  <Icons.ChevronRight size={14} />
                </button>
              )}
            </div>

            {loading ? (
              <div>
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
              </div>
            ) : students.length > 0 ? (
              <div className="table-card-wrapper">
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Student Details</th>
                        <th>Student ID</th>
                        <th>Department</th>
                        <th>Section</th>
                        <th>Semester</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.slice(0, 6).map((s) => (
                        <tr key={s._id}>
                          <td>
                            <div className="student-profile-cell">
                              <div className="avatar-initials" style={getAvatarStyle(s.name)}>
                                {getInitials(s.name)}
                              </div>
                              <div className="student-name-group">
                                <span className="student-name-text">{s.name}</span>
                                <span className="student-email-text">{s.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className="id-badge"
                              title="Click to copy ID"
                              onClick={(e) => handleCopyId(s.studentId, e)}
                            >
                              {s.studentId}
                              {copiedId === s.studentId ? (
                                <Icons.Check size={12} style={{ color: 'var(--emerald)' }} />
                              ) : (
                                <Icons.Copy size={12} />
                              )}
                            </span>
                          </td>
                          <td>
                            <span className="pill-badge dept">{s.department?.name || '—'}</span>
                          </td>
                          <td>
                            <span className="pill-badge section">{s.section || '—'}</span>
                          </td>
                          <td>
                            <span className="pill-badge semester">Sem {s.semester}</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              <button
                                className="table-action-btn"
                                title="View Profile"
                                onClick={() => setDetailStudent(s)}
                              >
                                <Icons.Eye size={16} />
                              </button>
                              <button
                                className="table-action-btn"
                                title="Edit Student"
                                onClick={() => openStudentForm(s)}
                              >
                                <Icons.Edit3 size={16} />
                              </button>
                              <button
                                className="table-action-btn danger"
                                title="Delete Student"
                                onClick={() => requestRemove('student', s)}
                              >
                                <Icons.Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="empty-state-card">
                <div className="empty-icon-circle">
                  <Icons.Users size={26} />
                </div>
                <div className="empty-title">No Students Enrolled Yet</div>
                <div className="empty-desc">
                  Start by adding your first student record or setting up departments.
                </div>
                <button
                  className="btn primary"
                  onClick={() => openStudentForm()}
                  disabled={!departments.length}
                >
                  <Icons.Plus size={16} />
                  <span>Add First Student</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STUDENTS DIRECTORY PAGE */}
        {page === 'students' && (
          <div>
            <div className="section-header">
              <div className="header-text-group">
                <h1>Student Directory</h1>
                <p>
                  Showing {visible.length} of {students.length} enrolled students
                </p>
              </div>
              <div className="action-bar-group">
                <button className="btn" onClick={handleExportCSV} title="Export students list to CSV">
                  <Icons.Download size={16} />
                  <span>Export CSV</span>
                </button>
                <button
                  className="btn primary"
                  onClick={() => openStudentForm()}
                  disabled={!departments.length}
                >
                  <Icons.Plus size={16} />
                  <span>Add Student</span>
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="filter-bar-card">
              <div className="filter-controls-group">
                {/* Search */}
                <div className="search-input-wrapper">
                  <Icons.Search size={16} className="search-icon" />
                  <input
                    type="text"
                    className="search-input"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, ID, email, or section..."
                    aria-label="Search students"
                  />
                  {query && (
                    <button
                      className="clear-search-btn"
                      onClick={() => setQuery('')}
                      title="Clear search"
                    >
                      <Icons.X size={14} />
                    </button>
                  )}
                </div>

                {/* Department filter */}
                <select
                  className="filter-select"
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  aria-label="Filter by department"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.name} ({counts[d._id] || 0})
                    </option>
                  ))}
                </select>

                {/* Semester filter */}
                <select
                  className="filter-select"
                  value={semesterFilter}
                  onChange={(e) => setSemesterFilter(e.target.value)}
                  aria-label="Filter by semester"
                >
                  <option value="">All Semesters</option>
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((sem) => (
                    <option key={sem} value={sem}>
                      Semester {sem}
                    </option>
                  ))}
                </select>

                {/* Sort dropdown */}
                <select
                  className="filter-select"
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-');
                    setSortBy(field);
                    setSortOrder(order);
                  }}
                  aria-label="Sort by"
                >
                  <option value="name-asc">Sort: Name (A-Z)</option>
                  <option value="name-desc">Sort: Name (Z-A)</option>
                  <option value="studentId-asc">Sort: ID (Ascending)</option>
                  <option value="semester-asc">Sort: Semester (1-8)</option>
                  <option value="department-asc">Sort: Department</option>
                </select>
              </div>

              {/* View Switcher: Table vs Cards */}
              <div className="view-switcher-group">
                <button
                  className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Table View"
                >
                  <Icons.List size={16} />
                </button>
                <button
                  className={`view-btn ${viewMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setViewMode('cards')}
                  title="Grid Cards View"
                >
                  <Icons.LayoutGrid size={16} />
                </button>
              </div>
            </div>

            {/* Department Requirement Alert if 0 departments */}
            {!departments.length && (
              <div className="info-callout warning">
                <Icons.AlertTriangle size={20} />
                <div>
                  <strong>No departments configured.</strong> You need at least one department before enrolling students.
                  <button
                    className="link"
                    style={{ marginLeft: '8px' }}
                    onClick={() => setPage('departments')}
                  >
                    Go to Departments &rarr;
                  </button>
                </div>
              </div>
            )}

            {/* Loading skeletons */}
            {loading ? (
              <div>
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
                <div className="skeleton-row" />
              </div>
            ) : visible.length > 0 ? (
              viewMode === 'table' ? (
                /* TABLE VIEW */
                <div className="table-card-wrapper">
                  <div className="data-table-container">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Student Details</th>
                          <th>Student ID</th>
                          <th>Department</th>
                          <th>Section</th>
                          <th>Semester</th>
                          <th>Contact</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((s) => (
                          <tr key={s._id}>
                            <td>
                              <div
                                className="student-profile-cell"
                                style={{ cursor: 'pointer' }}
                                onClick={() => setDetailStudent(s)}
                              >
                                <div className="avatar-initials" style={getAvatarStyle(s.name)}>
                                  {getInitials(s.name)}
                                </div>
                                <div className="student-name-group">
                                  <span className="student-name-text">{s.name}</span>
                                  <span className="student-email-text">{s.email}</span>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span
                                className="id-badge"
                                title="Click to copy ID"
                                onClick={(e) => handleCopyId(s.studentId, e)}
                              >
                                {s.studentId}
                                {copiedId === s.studentId ? (
                                  <Icons.Check size={12} style={{ color: 'var(--emerald)' }} />
                                ) : (
                                  <Icons.Copy size={12} />
                                )}
                              </span>
                            </td>
                            <td>
                              <span className="pill-badge dept">{s.department?.name || '—'}</span>
                            </td>
                            <td>
                              <span className="pill-badge section">{s.section || '—'}</span>
                            </td>
                            <td>
                              <span className="pill-badge semester">Sem {s.semester}</span>
                            </td>
                            <td>
                              {s.contact ? (
                                <a
                                  href={`tel:${s.contact}`}
                                  className="contact-row"
                                  title={`Call ${s.contact}`}
                                >
                                  <Icons.Phone size={13} />
                                  <span>{s.contact}</span>
                                </a>
                              ) : (
                                <span style={{ color: 'var(--text-subtle)' }}>—</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <button
                                  className="table-action-btn"
                                  title="View Full Profile"
                                  onClick={() => setDetailStudent(s)}
                                >
                                  <Icons.Eye size={16} />
                                </button>
                                <button
                                  className="table-action-btn"
                                  title="Edit Record"
                                  onClick={() => openStudentForm(s)}
                                >
                                  <Icons.Edit3 size={16} />
                                </button>
                                <button
                                  className="table-action-btn danger"
                                  title="Delete Record"
                                  onClick={() => requestRemove('student', s)}
                                >
                                  <Icons.Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* CARDS GRID VIEW */
                <div className="student-cards-grid">
                  {visible.map((s) => (
                    <div key={s._id} className="student-card-item">
                      <div>
                        <div className="card-top-row">
                          <div
                            className="student-profile-cell"
                            style={{ cursor: 'pointer' }}
                            onClick={() => setDetailStudent(s)}
                          >
                            <div className="avatar-initials" style={getAvatarStyle(s.name)}>
                              {getInitials(s.name)}
                            </div>
                            <div className="student-name-group">
                              <span className="student-name-text">{s.name}</span>
                              <span className="student-email-text">{s.email}</span>
                            </div>
                          </div>

                          <span
                            className="id-badge"
                            title="Click to copy ID"
                            onClick={(e) => handleCopyId(s.studentId, e)}
                          >
                            {s.studentId}
                            {copiedId === s.studentId ? (
                              <Icons.Check size={12} style={{ color: 'var(--emerald)' }} />
                            ) : (
                              <Icons.Copy size={12} />
                            )}
                          </span>
                        </div>

                        <div className="card-tags-row">
                          <span className="pill-badge dept">{s.department?.name || '—'}</span>
                          <span className="pill-badge section">Sec {s.section || '—'}</span>
                          <span className="pill-badge semester">Sem {s.semester}</span>
                        </div>
                      </div>

                      <div className="card-contact-group">
                        <a href={`mailto:${s.email}`} className="contact-row">
                          <Icons.Mail size={13} />
                          <span>{s.email}</span>
                        </a>
                        {s.contact ? (
                          <a href={`tel:${s.contact}`} className="contact-row">
                            <Icons.Phone size={13} />
                            <span>{s.contact}</span>
                          </a>
                        ) : (
                          <div className="contact-row" style={{ color: 'var(--text-subtle)' }}>
                            <Icons.Phone size={13} />
                            <span>No phone registered</span>
                          </div>
                        )}
                      </div>

                      <div className="card-footer-actions">
                        <button
                          className="btn ghost sm"
                          onClick={() => setDetailStudent(s)}
                        >
                          <Icons.Eye size={14} />
                          <span>View Details</span>
                        </button>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button
                            className="table-action-btn"
                            title="Edit Record"
                            onClick={() => openStudentForm(s)}
                          >
                            <Icons.Edit3 size={15} />
                          </button>
                          <button
                            className="table-action-btn danger"
                            title="Delete Record"
                            onClick={() => requestRemove('student', s)}
                          >
                            <Icons.Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* EMPTY FILTER RESULTS */
              <div className="empty-state-card">
                <div className="empty-icon-circle">
                  <Icons.Search size={26} />
                </div>
                <div className="empty-title">
                  {students.length ? 'No Matching Students Found' : 'No Students Yet'}
                </div>
                <div className="empty-desc">
                  {students.length
                    ? 'Try clearing your search query or adjusting your department filter.'
                    : 'Get started by creating departments and adding student profiles.'}
                </div>
                {students.length ? (
                  <button
                    className="btn"
                    onClick={() => {
                      setQuery('');
                      setDeptFilter('');
                      setSemesterFilter('');
                    }}
                  >
                    <Icons.X size={15} />
                    <span>Reset All Filters</span>
                  </button>
                ) : (
                  <button
                    className="btn primary"
                    onClick={() => openStudentForm()}
                    disabled={!departments.length}
                  >
                    <Icons.Plus size={16} />
                    <span>Add Student</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* DEPARTMENTS MANAGEMENT PAGE */}
        {page === 'departments' && (
          <div>
            <div className="section-header">
              <div className="header-text-group">
                <h1>Academic Departments</h1>
                <p>Manage faculty departments and classroom sections</p>
              </div>
              <button className="btn primary" onClick={() => openDepartmentForm()}>
                <Icons.Plus size={16} />
                <span>Add Department</span>
              </button>
            </div>

            <div className="info-callout">
              <Icons.AlertCircle size={20} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <div>
                <strong>Section Safety Constraint:</strong> Sections that currently have active enrolled
                students cannot be removed. Departments containing enrolled students cannot be deleted.
              </div>
            </div>

            {loading ? (
              <div>
                <div className="skeleton-row" />
                <div className="skeleton-row" />
              </div>
            ) : departments.length > 0 ? (
              <div className="department-cards-grid">
                {departments.map((dept) => {
                  const studentCount = counts[dept._id] || 0;
                  return (
                    <div key={dept._id} className="department-card">
                      <div>
                        <div className="department-card-header">
                          <div>
                            <h3 className="department-title-name">{dept.name}</h3>
                            <span className="pill-badge count">
                              <Icons.Users size={12} />
                              {studentCount} Enrolled Students
                            </span>
                          </div>
                          <div className="stat-icon-pill emerald" style={{ width: '36px', height: '36px' }}>
                            <Icons.Building2 size={18} />
                          </div>
                        </div>

                        <div style={{ marginTop: '16px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>
                            Configured Sections ({dept.sections.length})
                          </span>
                          <div className="section-chips-container">
                            {dept.sections.length > 0 ? (
                              dept.sections.map((sec) => (
                                <span key={sec} className="section-tag-chip">
                                  Section {sec}
                                </span>
                              ))
                            ) : (
                              <span style={{ fontSize: '13px', color: 'var(--text-subtle)' }}>
                                No sections assigned
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="card-footer-actions">
                        <button
                          className="btn ghost sm"
                          onClick={() => {
                            setDeptFilter(dept._id);
                            setPage('students');
                          }}
                        >
                          <Icons.Users size={14} />
                          <span>View Students</span>
                        </button>

                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            className="btn sm"
                            onClick={() => openDepartmentForm(dept)}
                          >
                            <Icons.Edit3 size={14} />
                            <span>Edit</span>
                          </button>
                          <button
                            className="btn sm danger"
                            onClick={() => requestRemove('department', dept)}
                            title={
                              studentCount > 0
                                ? 'Cannot delete department with enrolled students'
                                : 'Delete Department'
                            }
                          >
                            <Icons.Trash2 size={14} />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state-card">
                <div className="empty-icon-circle">
                  <Icons.Building2 size={26} />
                </div>
                <div className="empty-title">No Departments Configured</div>
                <div className="empty-desc">
                  Create academic faculties and sections to begin organizing student enrollments.
                </div>
                <button className="btn primary" onClick={() => openDepartmentForm()}>
                  <Icons.Plus size={16} />
                  <span>Create First Department</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL: ADD / EDIT FORM */}
      {form && (
        <div
          className="modal-backdrop-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setForm(null);
          }}
        >
          <form
            className="modal-window"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onSubmit={submitForm}
          >
            <div className="modal-header">
              <h2 id="modal-title">
                {form.type === 'student'
                  ? form.student
                    ? 'Edit Student Record'
                    : 'Enroll New Student'
                  : form.department
                    ? 'Edit Department'
                    : 'Add New Department'}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                disabled={saving}
                onClick={() => setForm(null)}
              >
                <Icons.X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {form.formError && (
                <div className="info-callout" style={{ background: 'var(--danger-glow)', borderColor: 'rgba(244,63,94,0.3)', color: 'var(--danger)' }}>
                  <Icons.AlertTriangle size={18} />
                  <span>{form.formError}</span>
                </div>
              )}

              {form.type === 'student' ? (
                <>
                  <div className="form-group">
                    <label className="form-label">
                      Student ID <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      required
                      maxLength="30"
                      disabled={Boolean(form.student)}
                      className="form-input"
                      placeholder="e.g. CS2026001"
                      value={form.values.studentId}
                      onChange={(e) => setField('studentId', e.target.value)}
                    />
                    {form.student && (
                      <span className="form-helper-text">Student ID is immutable once created.</span>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Full Name <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      required
                      maxLength="100"
                      className="form-input"
                      placeholder="e.g. John Doe"
                      value={form.values.name}
                      onChange={(e) => setField('name', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Email Address <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      required
                      type="email"
                      maxLength="254"
                      className="form-input"
                      placeholder="e.g. john.doe@campus.edu"
                      value={form.values.email}
                      onChange={(e) => setField('email', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Department <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <select
                      required
                      className="form-select"
                      value={form.values.department}
                      onChange={(e) => setField('department', e.target.value, { section: '' })}
                    >
                      <option value="" disabled>
                        Select academic department
                      </option>
                      {departments.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">
                        Section {formSections.length > 0 && <span style={{ color: 'var(--danger)' }}>*</span>}
                      </label>
                      <select
                        required={formSections.length > 0}
                        disabled={!formSections.length}
                        className="form-select"
                        value={form.values.section}
                        onChange={(e) => setField('section', e.target.value)}
                      >
                        <option value="" disabled={formSections.length > 0}>
                          {formSections.length ? 'Select Section' : 'None available'}
                        </option>
                        {formSections.map((s) => (
                          <option key={s} value={s}>
                            Section {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        Semester (1 - 12) <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        required
                        type="number"
                        min="1"
                        max="12"
                        className="form-input"
                        placeholder="1"
                        value={form.values.semester}
                        onChange={(e) => setField('semester', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Contact Phone (Optional)</label>
                    <input
                      type="tel"
                      maxLength="20"
                      className="form-input"
                      placeholder="e.g. +1 555-0199"
                      value={form.values.contact}
                      onChange={(e) => setField('contact', e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">
                      Department Name <span style={{ color: 'var(--danger)' }}>*</span>
                    </label>
                    <input
                      required
                      maxLength="80"
                      className="form-input"
                      placeholder="e.g. Computer Science and Engineering"
                      value={form.values.name}
                      onChange={(e) => setField('name', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Sections (Comma Separated)</label>
                    <input
                      maxLength="500"
                      className="form-input"
                      placeholder="A, B, C"
                      value={form.values.sections}
                      onChange={(e) => setField('sections', e.target.value)}
                    />
                    <span className="form-helper-text">
                      Separate each section name by commas (e.g. "A, B, C"). Active sections with enrolled students cannot be removed.
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="modal-actions-footer">
              <button
                type="button"
                className="btn ghost"
                disabled={saving}
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? (
                  <>
                    <Icons.RefreshCw size={15} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Record</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: STUDENT QUICK DETAILS PROFILE */}
      {detailStudent && (
        <div
          className="modal-backdrop-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetailStudent(null);
          }}
        >
          <div className="modal-window" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2>Student Profile Card</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDetailStudent(null)}
              >
                <Icons.X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="detail-avatar-banner">
                <div
                  className="avatar-initials"
                  style={{
                    ...getAvatarStyle(detailStudent.name),
                    width: '56px',
                    height: '56px',
                    fontSize: '20px'
                  }}
                >
                  {getInitials(detailStudent.name)}
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{detailStudent.name}</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span
                      className="id-badge"
                      title="Click to copy ID"
                      onClick={(e) => handleCopyId(detailStudent.studentId, e)}
                    >
                      {detailStudent.studentId}
                      {copiedId === detailStudent.studentId ? (
                        <Icons.Check size={12} style={{ color: 'var(--emerald)' }} />
                      ) : (
                        <Icons.Copy size={12} />
                      )}
                    </span>
                    <span className="pill-badge dept">{detailStudent.department?.name || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-item-label">Section</div>
                  <div className="detail-item-value">
                    <span className="pill-badge section">Section {detailStudent.section || '—'}</span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Current Term</div>
                  <div className="detail-item-value">
                    <span className="pill-badge semester">Semester {detailStudent.semester}</span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Email Address</div>
                  <div className="detail-item-value">
                    <a href={`mailto:${detailStudent.email}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Icons.Mail size={14} />
                      <span>{detailStudent.email}</span>
                    </a>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-item-label">Phone Contact</div>
                  <div className="detail-item-value">
                    {detailStudent.contact ? (
                      <a href={`tel:${detailStudent.contact}`} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Icons.Phone size={14} />
                        <span>{detailStudent.contact}</span>
                      </a>
                    ) : (
                      <span style={{ color: 'var(--text-subtle)' }}>None provided</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-actions-footer">
              <button
                className="btn danger sm"
                onClick={() => {
                  requestRemove('student', detailStudent);
                }}
              >
                <Icons.Trash2 size={14} />
                <span>Delete</span>
              </button>
              <button
                className="btn primary sm"
                onClick={() => {
                  openStudentForm(detailStudent);
                }}
              >
                <Icons.Edit3 size={14} />
                <span>Edit Profile</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CUSTOM CONFIRMATION DIALOG */}
      {confirmDialog && (
        <div
          className="modal-backdrop-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !saving) setConfirmDialog(null);
          }}
        >
          <div className="modal-window" style={{ maxWidth: '440px' }} role="alertdialog">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'var(--danger-glow)',
                    color: 'var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Icons.AlertTriangle size={18} />
                </div>
                <h2>{confirmDialog.title}</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                disabled={saving}
                onClick={() => setConfirmDialog(null)}
              >
                <Icons.X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6 }}>
                {confirmDialog.message}
              </p>
            </div>

            <div className="modal-actions-footer">
              <button
                type="button"
                className="btn ghost"
                disabled={saving}
                onClick={() => setConfirmDialog(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={saving}
                onClick={handleConfirmDelete}
              >
                {saving ? (
                  <>
                    <Icons.RefreshCw size={15} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Icons.Trash2 size={15} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TOAST NOTIFICATIONS */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item ${toast.type}`}>
            <div className={`toast-icon ${toast.type}`}>
              {toast.type === 'error' ? (
                <Icons.AlertCircle size={20} />
              ) : toast.type === 'warning' ? (
                <Icons.AlertTriangle size={20} />
              ) : toast.type === 'info' ? (
                <Icons.Sparkles size={20} />
              ) : (
                <Icons.Check size={20} />
              )}
            </div>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              <div className="toast-message">{toast.message}</div>
            </div>
            <button
              className="modal-close-btn"
              style={{ width: '24px', height: '24px' }}
              onClick={() => removeToast(toast.id)}
            >
              <Icons.X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* SMOOTH SCROLL TO TOP FLOATING BUTTON */}
      <button
        className={`scroll-top-btn ${showScrollTop ? 'visible' : ''}`}
        title="Scroll to top"
        onClick={scrollToTop}
        aria-label="Scroll to top"
      >
        <Icons.ArrowUp size={18} />
      </button>
    </div>
  );
}

export default App;
