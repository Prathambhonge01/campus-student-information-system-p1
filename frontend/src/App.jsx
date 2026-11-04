import { useCallback, useEffect, useMemo, useState } from 'react';
import { request } from './api.js';

const emptyStudent = { studentId: '', name: '', email: '', department: '', section: '', semester: '', contact: '' };

function App() {
  const [page, setPage] = useState('overview');
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d] = await Promise.all([request('/api/students'), request('/api/departments')]);
      setStudents(s.data);
      setDepartments(d.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) setForm(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving]);

  const counts = useMemo(() => {
    const m = {};
    students.forEach((s) => { const id = s.department?._id; if (id) m[id] = (m[id] || 0) + 1; });
    return m;
  }, [students]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => (!deptFilter || s.department?._id === deptFilter) &&
      (!q || [s.studentId, s.name, s.email, s.department?.name, s.section].join(' ').toLowerCase().includes(q)));
  }, [students, query, deptFilter]);

  const openStudent = (student = null) => setForm({
    type: 'student', student, formError: '',
    values: student ? {
      studentId: student.studentId, name: student.name, email: student.email, department: student.department?._id || '',
      section: student.section, semester: String(student.semester), contact: student.contact || ''
    } : { ...emptyStudent, department: deptFilter || departments[0]?._id || '' }
  });
  const openDepartment = (department = null) => setForm({
    type: 'department', department, formError: '',
    values: { name: department?.name || '', sections: department ? department.sections.join(', ') : '' }
  });
  const setField = (k, v, extra = {}) => setForm((f) => ({ ...f, values: { ...f.values, [k]: v, ...extra } }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { type, student, department, values } = form;
      if (type === 'student') {
        const path = student ? `/api/students/${encodeURIComponent(student.studentId)}` : '/api/students';
        await request(path, { method: student ? 'PUT' : 'POST', body: JSON.stringify({ ...values, semester: Number(values.semester) }) });
        setNotice(student ? 'Student updated.' : 'Student added.');
      } else {
        const sections = [...new Set(values.sections.split(',').map((s) => s.trim()).filter(Boolean))];
        await request(department ? `/api/departments/${department._id}` : '/api/departments', {
          method: department ? 'PUT' : 'POST', body: JSON.stringify({ name: values.name, sections })
        });
        setNotice(department ? 'Department updated.' : 'Department created.');
      }
      setForm(null);
      await loadData();
    } catch (e) {
      setForm((f) => ({ ...f, formError: e.message }));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind, item) => {
    if (!window.confirm(`Delete ${item.name}? This can't be undone.`)) return;
    try {
      await request(kind === 'student' ? `/api/students/${encodeURIComponent(item.studentId)}` : `/api/departments/${item._id}`, { method: 'DELETE' });
      setNotice(`${item.name} deleted.`);
      await loadData();
    } catch (e) {
      setError(e.message);
    }
  };

  const sectionsTotal = departments.reduce((n, d) => n + d.sections.length, 0);
  const semesters = new Set(students.map((s) => s.semester)).size;
  const formSections = departments.find((d) => d._id === form?.values?.department)?.sections || [];
  const pages = [['overview', 'Overview'], ['students', 'Students'], ['departments', 'Departments']];

  const StudentTable = ({ rows }) => (
    <table>
      <thead><tr><th>Name</th><th>ID</th><th>Department</th><th>Section</th><th>Semester</th><th /></tr></thead>
      <tbody>{rows.map((s) => (
        <tr key={s._id}>
          <td><span className="strong">{s.name}</span><span className="sub">{s.email}</span></td>
          <td>{s.studentId}</td><td>{s.department?.name || '—'}</td><td>{s.section || '—'}</td><td>{s.semester}</td>
          <td className="right"><button className="link" onClick={() => openStudent(s)}>Edit</button><button className="link danger" onClick={() => remove('student', s)}>Delete</button></td>
        </tr>))}
      </tbody>
    </table>
  );

  return (
    <div className="wrap">
      <header className="top">
        <span className="brand">CampusDesk</span>
        <nav aria-label="Main">
          {pages.map(([key, label]) => (
            <button key={key} className={page === key ? 'on' : ''} aria-current={page === key ? 'page' : undefined}
              onClick={() => { if (key === 'students') { setDeptFilter(''); setQuery(''); } setPage(key); }}>{label}</button>
          ))}
        </nav>
      </header>

      <main>
        {error && <p className="msg error" role="alert">{error} <button className="link" onClick={() => setError('')}>Dismiss</button></p>}
        {notice && <p className="msg" role="status">{notice}</p>}

        {page === 'overview' && (<>
          <div className="title"><h1>Overview</h1><button className="btn primary" onClick={() => openStudent()} disabled={!departments.length}>Add student</button></div>
          <dl className="stats">
            <div><dt>Students</dt><dd>{students.length}</dd></div>
            <div><dt>Departments</dt><dd>{departments.length}</dd></div>
            <div><dt>Sections</dt><dd>{sectionsTotal}</dd></div>
            <div><dt>Semesters</dt><dd>{semesters}</dd></div>
          </dl>
          <h2>Recent students</h2>
          {students.length ? <StudentTable rows={students.slice(0, 5)} /> : <Empty text={loading ? 'Loading…' : 'No students yet.'} />}
          {students.length > 5 && <p className="more"><button className="link" onClick={() => setPage('students')}>View all {students.length} students</button></p>}
        </>)}

        {page === 'students' && (<>
          <div className="title"><h1>Students</h1><button className="btn primary" onClick={() => openStudent()} disabled={!departments.length}>Add student</button></div>
          <div className="filters">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, ID or email" aria-label="Search students" />
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} aria-label="Filter by department">
              <option value="">All departments</option>{departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          {!departments.length && <p className="msg">Create a department first. <button className="link" onClick={() => setPage('departments')}>Go to departments</button></p>}
          {visible.length ? <StudentTable rows={visible} /> : <Empty text={loading ? 'Loading…' : students.length ? 'No students match your search.' : 'No students yet.'} />}
        </>)}

        {page === 'departments' && (<>
          <div className="title"><h1>Departments</h1><button className="btn primary" onClick={() => openDepartment()}>Add department</button></div>
          {departments.length ? (
            <table>
              <thead><tr><th>Name</th><th>Sections</th><th>Students</th><th /></tr></thead>
              <tbody>{departments.map((d) => (
                <tr key={d._id}>
                  <td className="strong">{d.name}</td><td>{d.sections.join(', ') || '—'}</td><td>{counts[d._id] || 0}</td>
                  <td className="right"><button className="link" onClick={() => openDepartment(d)}>Edit</button><button className="link danger" onClick={() => remove('department', d)}>Delete</button></td>
                </tr>))}
              </tbody>
            </table>
          ) : <Empty text={loading ? 'Loading…' : 'No departments yet.'} />}
        </>)}
      </main>

      {form && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setForm(null); }}>
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="mt" onSubmit={submit}>
            <h2 id="mt">{form.type === 'student' ? (form.student ? 'Edit student' : 'Add student') : (form.department ? 'Edit department' : 'Add department')}</h2>
            {form.formError && <p className="msg error" role="alert">{form.formError}</p>}
            {form.type === 'student' ? (<>
              <label>Student ID<input required maxLength="30" disabled={Boolean(form.student)} value={form.values.studentId} onChange={(e) => setField('studentId', e.target.value)} /></label>
              <label>Full name<input required maxLength="100" value={form.values.name} onChange={(e) => setField('name', e.target.value)} /></label>
              <label>Email<input required type="email" maxLength="254" value={form.values.email} onChange={(e) => setField('email', e.target.value)} /></label>
              <label>Department<select required value={form.values.department} onChange={(e) => setField('department', e.target.value, { section: '' })}>
                <option value="" disabled>Select</option>{departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}</select></label>
              <div className="row">
                <label>Section<select required={formSections.length > 0} disabled={!formSections.length} value={form.values.section} onChange={(e) => setField('section', e.target.value)}>
                  <option value="" disabled={formSections.length > 0}>{formSections.length ? 'Select' : 'None'}</option>{formSections.map((s) => <option key={s}>{s}</option>)}</select></label>
                <label>Semester<input required type="number" min="1" max="12" value={form.values.semester} onChange={(e) => setField('semester', e.target.value)} /></label>
              </div>
              <label>Phone (optional)<input type="tel" maxLength="20" value={form.values.contact} onChange={(e) => setField('contact', e.target.value)} /></label>
            </>) : (<>
              <label>Name<input required maxLength="80" value={form.values.name} onChange={(e) => setField('name', e.target.value)} /></label>
              <label>Sections (comma separated)<input maxLength="500" placeholder="A, B" value={form.values.sections} onChange={(e) => setField('sections', e.target.value)} /></label>
              <p className="hint">Sections that still have students can’t be removed.</p>
            </>)}
            <div className="actions">
              <button type="button" className="btn" disabled={saving} onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const Empty = ({ text }) => <p className="empty">{text}</p>;

export default App;