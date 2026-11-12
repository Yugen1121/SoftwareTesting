module.exports = (row) => row ? Object.freeze({ id: row.id, full_name: row.full_name, email: row.email, role: row.role, is_active: row.is_active }) : null;
