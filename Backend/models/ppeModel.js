const pool = require('../config/db');

const getPPEItemById = async (id) => {
  const result = await pool.query('SELECT * FROM ppe_items WHERE id = $1', [id]);
  return result.rows[0];
};

const createPPERequest = async (ppe_item_id, requested_by, quantity, notes, worker_name, department) => {
  const result = await pool.query(
    `INSERT INTO ppe_requests (ppe_item_id, requested_by, quantity, notes, worker_name, department, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
    [ppe_item_id, requested_by, quantity, notes, worker_name, department]
  );
  return result.rows[0];
};

const approveRequest = async (requestId, approvedBy) => {
  const request = await pool.query('SELECT * FROM ppe_requests WHERE id = $1', [requestId]);
  if (!request.rows[0]) throw new Error('Request not found');
  if (request.rows[0].status !== 'pending') throw new Error('Only pending requests can be approved');

  const { ppe_item_id, quantity } = request.rows[0];

  const itemResult = await pool.query('SELECT * FROM ppe_items WHERE id = $1', [ppe_item_id]);
  const item = itemResult.rows[0];
  const available = item.current_stock - (item.reserved_stock || 0);

  if (quantity > available) {
    throw new Error(`Not enough available stock. Available: ${available}`);
  }

  await pool.query(
    'UPDATE ppe_items SET reserved_stock = reserved_stock + $1 WHERE id = $2',
    [quantity, ppe_item_id]
  );

  const result = await pool.query(
    `UPDATE ppe_requests SET status = 'approved', approved_by = $1, approved_at = NOW()
     WHERE id = $2 RETURNING *`,
    [approvedBy, requestId]
  );
  return result.rows[0];
};

const rejectRequest = async (requestId, approvedBy, reject_reason) => {
  const request = await pool.query('SELECT * FROM ppe_requests WHERE id = $1', [requestId]);
  if (!request.rows[0]) throw new Error('Request not found');

  const { ppe_item_id, quantity, status } = request.rows[0];

  // If it was approved (stock was reserved), release the reservation
  if (status === 'approved') {
    await pool.query(
      'UPDATE ppe_items SET reserved_stock = GREATEST(reserved_stock - $1, 0) WHERE id = $2',
      [quantity, ppe_item_id]
    );
  }

  const result = await pool.query(
    `UPDATE ppe_requests SET status = 'rejected', approved_by = $1, approved_at = NOW(), reject_reason = $2
     WHERE id = $3 RETURNING *`,
    [approvedBy, reject_reason, requestId]
  );
  return result.rows[0];
};

const fulfillRequest = async (requestId, fulfilledBy) => {
  const request = await pool.query('SELECT * FROM ppe_requests WHERE id = $1', [requestId]);
  if (!request.rows[0]) throw new Error('Request not found');
  if (request.rows[0].status !== 'approved') throw new Error('Request must be approved first');

  const { ppe_item_id, quantity } = request.rows[0];

  // Deduct from stock and clear reservation
  await pool.query(
    'UPDATE ppe_items SET current_stock = current_stock - $1, reserved_stock = reserved_stock - $1 WHERE id = $2',
    [quantity, ppe_item_id]
  );

  const result = await pool.query(
    `UPDATE ppe_requests SET status = 'fulfilled', fulfilled_by = $1, fulfilled_at = NOW()
     WHERE id = $2 RETURNING *`,
    [fulfilledBy, requestId]
  );
  return result.rows[0];
};

const getAllRequests = async () => {
  const result = await pool.query(`
    SELECT 
      r.*,
      u.full_name as requested_by_name,
      a.full_name as approved_by_name,
      f.full_name as fulfilled_by_name,
      p.item_name,
      p.size_spec
    FROM ppe_requests r
    LEFT JOIN users u ON r.requested_by = u.id
    LEFT JOIN users a ON r.approved_by = a.id
    LEFT JOIN users f ON r.fulfilled_by = f.id
    LEFT JOIN ppe_items p ON r.ppe_item_id = p.id
    ORDER BY r.requested_at DESC
  `);
  return result.rows;
};

// PPE Items - full CRUD
const createPPEItem = async (data) => {
  const { item_name, size_spec, unit_of_measure, reorder_level } = data;
  const result = await pool.query(
    `INSERT INTO ppe_items (item_name, size_spec, unit_of_measure, reorder_level, current_stock, reserved_stock)
     VALUES ($1,$2,$3,$4,0,0) RETURNING *`,
    [item_name, size_spec, unit_of_measure, reorder_level || 0]
  );
  return result.rows[0];
};

const updatePPEItem = async (id, data) => {
  const { item_name, size_spec, unit_of_measure, reorder_level } = data;
  const result = await pool.query(
    `UPDATE ppe_items
     SET item_name=$1, size_spec=$2, unit_of_measure=$3,
         reorder_level = COALESCE($4, reorder_level),
         updated_at=NOW()
     WHERE id=$5 RETURNING *`,
    [item_name, size_spec, unit_of_measure, reorder_level ?? null, id]
  );
  return result.rows[0];
};

const softDeletePPEItem = async (id, reason) => {
  const result = await pool.query(
    `UPDATE ppe_items SET is_deleted=TRUE, deleted_reason=$1, deleted_at=NOW() WHERE id=$2 RETURNING *`,
    [reason, id]
  );
  return result.rows[0];
};

// Override getAllPPEItems to exclude soft-deleted
const getAllPPEItems = async () => {
  const result = await pool.query('SELECT * FROM ppe_items WHERE is_deleted = FALSE ORDER BY id');
  return result.rows;
};

// Transactions
const createTransaction = async (data) => {
  const { ppe_item_id, transaction_type, quantity, transaction_date, notes, recorded_by } = data;

  // Update stock based on transaction type
  let stockUpdateQuery;
  if (transaction_type === 'received') {
    stockUpdateQuery = 'UPDATE ppe_items SET current_stock = current_stock + $1 WHERE id = $2';
  } else if (transaction_type === 'issued') {
    stockUpdateQuery = 'UPDATE ppe_items SET current_stock = current_stock - $1 WHERE id = $2';
  } else if (transaction_type === 'stocktake') {
    stockUpdateQuery = 'UPDATE ppe_items SET current_stock = $1 WHERE id = $2';
  }
  await pool.query(stockUpdateQuery, [quantity, ppe_item_id]);

  const result = await pool.query(
    `INSERT INTO ppe_transactions (ppe_item_id, transaction_type, quantity, transaction_date, notes, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [ppe_item_id, transaction_type, quantity, transaction_date, notes, recorded_by]
  );
  return result.rows[0];
};

const getTransactionsByItem = async (ppe_item_id) => {
  const result = await pool.query(
    'SELECT * FROM ppe_transactions WHERE ppe_item_id = $1 ORDER BY transaction_date DESC',
    [ppe_item_id]
  );
  return result.rows;
};

const getAllTransactions = async () => {
  const result = await pool.query('SELECT * FROM ppe_transactions ORDER BY transaction_date DESC');
  return result.rows;
};

const deleteRequest = async (id) => {
  await pool.query('DELETE FROM ppe_requests WHERE id = $1', [id]);
};

const recalculatePPEStock = async (ppe_item_id) => {
  const txResult = await pool.query(
    'SELECT * FROM ppe_transactions WHERE ppe_item_id = $1 ORDER BY transaction_date ASC, id ASC',
    [ppe_item_id]
  );

  let stock = 0;
  for (const tx of txResult.rows) {
    const qty = Number(tx.quantity);
    if (tx.transaction_type === 'received') stock += qty;
    else if (tx.transaction_type === 'issued') stock -= qty;
    else if (tx.transaction_type === 'stocktake') stock = qty;
  }

  await pool.query('UPDATE ppe_items SET current_stock = $1 WHERE id = $2', [stock, ppe_item_id]);
  return stock;
};

const updateTransaction = async (id, data) => {
  const existing = await pool.query('SELECT * FROM ppe_transactions WHERE id = $1', [id]);
  if (!existing.rows[0]) throw new Error('Transaction not found');
  const ppe_item_id = existing.rows[0].ppe_item_id;

  const { transaction_type, quantity, transaction_date, notes } = data;
  const result = await pool.query(
    `UPDATE ppe_transactions
     SET transaction_type=$1, quantity=$2, transaction_date=$3, notes=$4
     WHERE id=$5 RETURNING *`,
    [transaction_type, quantity, transaction_date, notes, id]
  );

  await recalculatePPEStock(ppe_item_id);
  return result.rows[0];
};

const deleteTransaction = async (id) => {
  const existing = await pool.query('SELECT * FROM ppe_transactions WHERE id = $1', [id]);
  if (!existing.rows[0]) throw new Error('Transaction not found');
  const ppe_item_id = existing.rows[0].ppe_item_id;

  const result = await pool.query('DELETE FROM ppe_transactions WHERE id = $1 RETURNING *', [id]);
  await recalculatePPEStock(ppe_item_id);
  return result.rows[0];
};

module.exports = {
  getAllPPEItems, getPPEItemById,
  createPPERequest, approveRequest, rejectRequest, fulfillRequest, getAllRequests,
  createPPEItem, updatePPEItem, softDeletePPEItem,
  createTransaction, getTransactionsByItem, getAllTransactions, deleteRequest,
  recalculatePPEStock, updateTransaction, deleteTransaction
};