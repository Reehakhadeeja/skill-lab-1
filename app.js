const express = require('express');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


class BillRequest {
    constructor(id, type, amount, urgency) {
        this.id = id;
        this.type = type;
        this.amount = amount;
        this.urgency = urgency; 
        this.priority = urgency ? 1 : 2;
    }
}

class Queue {
    constructor() {
        this.queue = [];
    }

    enqueue(request) {
        this.queue.push(request);
    }

    dequeue() {
        return this.queue.shift();
    }

    isEmpty() {
        return this.queue.length === 0;
    }
}

class PriorityQueue extends Queue {
    enqueue(request) {
        super.enqueue(request);
        this.queue.sort((a, b) => a.priority - b.priority);
    }
}

class TransactionStack {
    constructor() {
        this.stack = [];
    }

    addTransaction(request) {
        this.stack.push(request);
    }

    undoLastTransaction() {
        return this.stack.pop();
    }

    getHistory() {
        return this.stack;
    }
}


const generalQueue = new Queue();
const urgentQueue = new PriorityQueue();
const transactionStack = new TransactionStack();

if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
}

function logTransaction(request) {
    const csvWriter = createCsvWriter({
        path: `data/invoice_${request.id}.csv`,
        header: [
            { id: 'id', title: 'ID' },
            { id: 'type', title: 'Utility Type' },
            { id: 'amount', title: 'Amount' },
            { id: 'timestamp', title: 'Timestamp' },
            { id: 'urgency', title: 'Urgency' }
        ]
    });

    const record = {
        id: request.id,
        type: request.type,
        amount: request.amount,
        timestamp: new Date().toISOString(),
        urgency: request.urgency ? 'Urgent' : 'Normal'
    };

    csvWriter.writeRecords([record]).then(() => console.log(`Invoice generated for ${request.id}`));
}


function generateDailyLog(transactions) {
    const csvWriter = createCsvWriter({
        path: 'data/daily_log.csv',
        header: [
            { id: 'id', title: 'ID' },
            { id: 'type', title: 'Utility Type' },
            { id: 'amount', title: 'Amount' },
            { id: 'timestamp', title: 'Timestamp' },
            { id: 'urgency', title: 'Urgency' }
        ]
    });

    const records = transactions.map(request => ({
        id: request.id,
        type: request.type,
        amount: request.amount,
        timestamp: request.timestamp || new Date().toISOString(),
        urgency: request.urgency ? 'Urgent' : 'Normal'
    }));

    csvWriter.writeRecords(records).then(() => console.log('Daily log generated'));
}


app.post('/pay', (req, res) => {
    const { id, type, amount, urgency } = req.body;
    const request = new BillRequest(id, type, amount, urgency);

    if (urgency) {
        urgentQueue.enqueue(request);
    } else {
        generalQueue.enqueue(request);
    }
    res.status(201).send('Payment request added');
});

app.get('/process', (req, res) => {
    let request;
    if (!urgentQueue.isEmpty()) {
        request = urgentQueue.dequeue();
    } else if (!generalQueue.isEmpty()) {
        request = generalQueue.dequeue();
    } else {
        return res.status(404).send('No payment requests in queue');
    }

    transactionStack.addTransaction(request);
    logTransaction(request);
    res.status(200).send(`Processed request ID: ${request.id}`);
});

app.post('/undo', (req, res) => {
    const undoneTransaction = transactionStack.undoLastTransaction();
    if (!undoneTransaction) {
        return res.status(404).send('No transactions to undo');
    }

    if (undoneTransaction.urgency) {
        urgentQueue.enqueue(undoneTransaction);
    } else {
        generalQueue.enqueue(undoneTransaction);
    }
    res.status(200).send(`Undo transaction for request ID: ${undoneTransaction.id}`);
});

app.get('/log', (req, res) => {
    generateDailyLog(transactionStack.getHistory());
    res.status(200).send('Daily log generated');
});


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
