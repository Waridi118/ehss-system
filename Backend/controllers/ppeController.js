const ppeModel = require('../models/ppeModel');
const logAudit = require('../utils/audit'); 

const getPPEItems = async (req, res) => {
  try {
    const items = await ppeModel.getAllPPEItems();
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getPPEItem = async (req, res) => {
  try {
    const item = await ppeModel.getPPEItemById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createRequest = async (req, res) => {
  try {
    const { ppe_item_id, requested_by, quantity, notes, worker_name, department } = req.body;
    const request = await ppeModel.createPPERequest(ppe_item_id, requested_by, quantity, notes, worker_name, department);
    res.status(201).json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const approve = async (req, res) => {
  try {
    const { approved_by } = req.body;
    const request = await ppeModel.approveRequest(req.params.id, approved_by);
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const reject = async (req, res) => {
  try {
    const { approved_by, reject_reason } = req.body;
    const request = await ppeModel.rejectRequest(req.params.id, approved_by, reject_reason);
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
const fulfill = async (req, res) => {
  try {
    const { fulfilled_by } = req.body;
    const request = await ppeModel.fulfillRequest(req.params.id, fulfilled_by);
    res.json(request);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

const getRequests = async (req, res) => {
  try {
    const requests = await ppeModel.getAllRequests();
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createItem = async (req, res) => {
  try {
    const item = await ppeModel.createPPEItem(req.body);
     await logAudit({ userId: req.user?.id, userName: req.user?.full_name, action: 'CREATE', tableName: 'ppe_management', recordId: item.id, newValue: item, ip: req.ip });
    res.status(201).json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateItem = async (req, res) => {
  try {
    const item = await ppeModel.updatePPEItem(req.params.id, req.body);
    await logAudit({ userId: req.user?.id, userName: req.user?.full_name, action: 'UPDATE', tableName: 'ppe_management', recordId: item.id, newValue: item, ip: req.ip });
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteItem = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Deletion reason is required.' });
    const deleted = await ppeModel.softDeletePPEItem(req.params.id, reason);
    await logAudit({ userId: req.user?.id, userName: req.user?.full_name, action: 'DELETE', tableName: 'ppe_management', recordId: deleted.id, ip: req.ip });
    res.json(deleted);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const createTx = async (req, res) => {
  try {
    const tx = await ppeModel.createTransaction(req.body);
    res.status(201).json(tx);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getTxByItem = async (req, res) => {
  try {
    const txs = await ppeModel.getTransactionsByItem(req.params.itemId);
    res.json(txs);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const getAllTx = async (req, res) => {
  try {
    const txs = await ppeModel.getAllTransactions();
    res.json(txs);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteRequestItem = async (req, res) => {
  try {
    await ppeModel.deleteRequest(req.params.id);
    res.status(204).send();
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateTx = async (req, res) => {
  try {
    const tx = await ppeModel.updateTransaction(req.params.id, req.body);
    await logAudit({ userId: req.user?.id, userName: req.user?.full_name, action: 'UPDATE', tableName: 'ppe_transactions', recordId: tx.id, newValue: tx, ip: req.ip });
    res.json(tx);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteTx = async (req, res) => {
  try {
    const deleted = await ppeModel.deleteTransaction(req.params.id);
    await logAudit({ userId: req.user?.id, userName: req.user?.full_name, action: 'DELETE', tableName: 'ppe_transactions', recordId: deleted.id, ip: req.ip });
    res.json(deleted);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = {
  getPPEItems, getPPEItem,
  createRequest, approve, reject, fulfill, getRequests,
  createItem, updateItem, deleteItem,
  createTx, getTxByItem, getAllTx, deleteRequestItem, updateTx, deleteTx
};