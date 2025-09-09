import express from "express";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import cors from "cors";
dotenv.config();

const app = express();

const GEMINI_API_KEY = process.env.GEMINI_KEY;
const DATA_FILE = './momo_test_transactions.json';
 app.use(cors({   origin: "http://127.0.0.1:5501", // frontend origin
  methods: ["GET", "POST"], // optional: allowed methods
  credentials: true // optional: if you send cookies
 }));
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// GET endpoint with optional ?limit=20 query param
app.get("/api/analyze", async (req, res) => {
    let limit = Number(req.query.limit) || 20;
    if (isNaN(limit) || limit <= 0) limit = 20;

    try {
        // 1. Read transaction data from file
        const rawData = fs.readFileSync(DATA_FILE, "utf-8");
        const allTransactions = JSON.parse(rawData);

        // 2. Select the most recent transactions
        const transactions = allTransactions.slice(-limit);

        // 3. Prepare prompt for Gemini
        const prompt = `
Analyze the following transactions and return only the total number of transactions flagged as fraudulent. Do not list individual transactions, just provide the count:
${JSON.stringify(transactions, null, 2)}
`;

        // 4. Call Gemini API
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        // 5. Send result back to client
        res.json({ fraudulentCount: response.text.trim() });

    } catch (error) {
        console.error("Error analyzing transactions:", error);
        res.status(500).json({ error: "Failed to analyze transactions" });
    }
});
// GET endpoint to block fraudulent transactions
app.get("/api/block-fraud", async (req, res) => {
    let limit = Number(req.query.limit) || 20;
    if (isNaN(limit) || limit <= 0) limit = 20;

    try {
        // 1. Read transaction data from file
        const rawData = fs.readFileSync(DATA_FILE, "utf-8");
        const allTransactions = JSON.parse(rawData);

        // 2. Take only the most recent 'limit' transactions
        const transactionsToCheck = allTransactions.slice(-limit);

        // 3. Prepare prompt for Gemini to identify fraudulent transactions
        const prompt = `
Analyze the following transactions and return only the IDs of transactions that are fraudulent:
${JSON.stringify(transactionsToCheck, null, 2)}
Return the IDs as a JSON array.
`;

        // 4. Call Gemini API
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });

        // 5. Parse AI response as an array of IDs
        let fraudulentIds = [];
        try {
            fraudulentIds = JSON.parse(response.text.trim());
        } catch (e) {
            console.error("Failed to parse AI response:", e);
        }

        // 6. Block fraudulent transactions in the full dataset
        const updatedTransactions = allTransactions.map(tx => {
            if (fraudulentIds.includes(tx.id)) {
                return { ...tx, blocked: true };
            }
            return tx;
        });

        // 7. Save updated transactions back to file
        fs.writeFileSync(DATA_FILE, JSON.stringify(updatedTransactions, null, 2), "utf-8");

        // 8. Respond with summary
        res.json({
            totalTransactions: allTransactions.length,
            analyzedCount: transactionsToCheck.length,
            blockedCount: fraudulentIds.length,
            blockedIds: fraudulentIds
        });

    } catch (error) {
        console.error("Error blocking fraudulent transactions:", error);
        res.status(500).json({ error: "Failed to block fraudulent transactions" });
    }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
