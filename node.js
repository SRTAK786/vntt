const express = require('express');
const axios = require('axios');
const multer = require('multer');
const { Web3 } = require('web3');
const path = require('path');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Configuration
const CONFIG = {
    contractAddress: "YOUR_CONTRACT_ADDRESS",
    contractABI: [...], // Your contract ABI here
    adminPrivateKey: "YOUR_ADMIN_PRIVATE_KEY",
    web3Provider: "https://bsc-dataseed.binance.org/",
    
    // Social Media API Keys (free tier)
    twitter: {
        bearerToken: process.env.TWITTER_BEARER_TOKEN
    },
    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN
    }
};

// Initialize Web3
const web3 = new Web3(CONFIG.web3Provider);
const contract = new web3.eth.Contract(CONFIG.contractABI, CONFIG.contractAddress);

// Task Verification API Endpoints
app.post('/api/verify/twitter-follow', async (req, res) => {
    const { username, proofUrl } = req.body;
    
    try {
        // Verify Twitter follow using Twitter API
        const response = await axios.get(
            `https://api.twitter.com/2/users/by/username/${username}`,
            {
                headers: {
                    'Authorization': `Bearer ${CONFIG.twitter.bearerToken}`
                }
            }
        );
        
        // Check if user follows our account
        // This is simplified - actual implementation needs proper Twitter API setup
        
        res.json({
            success: true,
            verified: true,
            message: "Twitter follow verified"
        });
    } catch (error) {
        res.json({
            success: false,
            verified: false,
            message: "Verification failed"
        });
    }
});

app.post('/api/verify/telegram-join', async (req, res) => {
    const { userId, username } = req.body;
    
    try {
        // Telegram bot can check if user is member of channel
        // Using Telegram Bot API
        const response = await axios.get(
            `https://api.telegram.org/bot${CONFIG.telegram.botToken}/getChatMember`,
            {
                params: {
                    chat_id: "@YourChannelName",
                    user_id: userId
                }
            }
        );
        
        const status = response.data.result.status;
        const isMember = status === 'member' || status === 'administrator' || status === 'creator';
        
        res.json({
            success: true,
            verified: isMember,
            message: isMember ? "Telegram join verified" : "User not in channel"
        });
    } catch (error) {
        res.json({
            success: false,
            verified: false,
            message: "Verification failed"
        });
    }
});

app.post('/api/verify/proof-upload', upload.single('screenshot'), async (req, res) => {
    const { taskId, userAddress } = req.body;
    const screenshot = req.file;
    
    if (!screenshot) {
        return res.status(400).json({ error: "No file uploaded" });
    }
    
    // Save proof information to database
    // In production, use a database like MongoDB or PostgreSQL
    const proofData = {
        taskId,
        userAddress,
        screenshotPath: screenshot.path,
        timestamp: new Date(),
        status: "pending",
        verifiedBy: null,
        verifiedAt: null
    };
    
    // Save to database (pseudo-code)
    // await db.proofs.insertOne(proofData);
    
    res.json({
        success: true,
        message: "Proof uploaded and awaiting admin verification",
        proofId: Date.now().toString()
    });
});

// Admin verification endpoint
app.post('/api/admin/verify-task', async (req, res) => {
    const { userAddress, taskId, verified } = req.body;
    const adminSignature = req.headers['admin-signature'];
    
    // Verify admin signature (basic implementation)
    if (adminSignature !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    
    try {
        // Call contract to verify task
        const account = web3.eth.accounts.privateKeyToAccount(CONFIG.adminPrivateKey);
        web3.eth.accounts.wallet.add(account);
        
        const tx = contract.methods.verifyTask(userAddress, taskId, verified);
        const gas = await tx.estimateGas({ from: account.address });
        const gasPrice = await web3.eth.getGasPrice();
        
        const txData = {
            from: account.address,
            to: CONFIG.contractAddress,
            data: tx.encodeABI(),
            gas,
            gasPrice
        };
        
        const signedTx = await web3.eth.accounts.signTransaction(txData, CONFIG.adminPrivateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        
        res.json({
            success: true,
            transactionHash: receipt.transactionHash,
            message: verified ? "Task verified successfully" : "Task verification rejected"
        });
    } catch (error) {
        console.error("Contract call error:", error);
        res.status(500).json({ error: "Failed to update contract" });
    }
});

// Get pending proofs for admin
app.get('/api/admin/pending-proofs', async (req, res) => {
    // Get all pending proofs from database
    // const proofs = await db.proofs.find({ status: "pending" }).toArray();
    
    // Sample response
    res.json({
        proofs: [
            {
                id: "1",
                userAddress: "0x123...",
                taskId: "twitter_follow_1",
                screenshotUrl: "/uploads/screenshot1.jpg",
                timestamp: "2024-01-20T10:30:00Z",
                userInfo: {
                    twitterHandle: "@username"
                }
            }
        ]
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;
