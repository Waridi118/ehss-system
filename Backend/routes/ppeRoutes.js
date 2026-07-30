const express = require('express');
const router = express.Router();
const ppeController = require('../controllers/ppeController');

router.get('/', ppeController.getPPEItems);

router.get('/requests', ppeController.getRequests);
router.post('/requests', ppeController.createRequest);
router.put('/requests/:id/approve', ppeController.approve);
router.put('/requests/:id/reject', ppeController.reject);
router.put('/requests/:id/fulfill', ppeController.fulfill);

router.get('/transactions', ppeController.getAllTx);
router.post('/transactions', ppeController.createTx);
router.get('/transactions/:itemId', ppeController.getTxByItem);
router.put('/transactions/:id', ppeController.updateTx);
router.delete('/transactions/:id', ppeController.deleteTx);

router.get('/:id', ppeController.getPPEItem);
router.post('/', ppeController.createItem);
router.put('/:id', ppeController.updateItem);
router.delete('/:id', ppeController.deleteItem);
router.delete('/requests/:id', ppeController.deleteRequestItem);

module.exports = router;