import * as cheerio from 'cheerio';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { updateVercelReformAttendanceData } from path.resolve('./scrapers/vercelstandard');
import { list } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const OUT_DIR = path.resolve('./scrapers/out');

app.use(express.static('public'));

// API endpoint to get councillor headshot
app.get('/api/headshot', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url parameter' });
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch details page');
        const html = await response.text();
        const $ = cheerio.load(html);
        // Try to find the first image inside a div with class 'mgBigPhoto'
        let img = $('.mgBigPhoto img').first().attr('src');
        // Fallback: try to find the image at the given XPath
        if (!img)
            img = $(
                'body > div:nth-child(1) > div:nth-child(5) > div > div > div:nth-child(2) > div:nth-child(1) > img'
            ).attr('src');
        // Fallback: try to find the first img in the main content
        if (!img) img = $('img').first().attr('src');
        if (!img) return res.status(404).json({ error: 'No headshot found' });
        // If the src is relative, resolve it against the base url
        const base = new URL(url);
        if (img.startsWith('/')) img = base.origin + img;
        else if (!img.startsWith('http')) img = base.origin + '/' + img;
        res.json({ img });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch headshot' });
    }
});
// Get list of council data files
app.get('/api/councils', async (req, res) => {
    try {
        // Read councils.json to get baseUrl mapping
        const councilsJsonPath = path.resolve('./scrapers/councils.json');
        const councilsJson = await fs.readFile(councilsJsonPath, 'utf-8');
        const councilMeta = JSON.parse(councilsJson);

        // PRE VERCEL CODE
        // const files = await fs.readdir(OUT_DIR);
        // const councilFiles = files.filter((f) => f.endsWith('Data.json'));
        // const councils = [];
        // for (const file of councilFiles) {
        //     try {
        //         const data = await fs.readFile(
        //             path.join(OUT_DIR, file),
        //             'utf-8'
        //         );
        //         const json = JSON.parse(data);
        //         // Try to match by councilName (case-insensitive, trimmed)
        //         let meta = councilMeta.find(
        //             (c) =>
        //                 c.councilName.trim().toLowerCase() ===
        //                 json.councilName.trim().toLowerCase()
        //         );
        //         // If not found, try matching by fileName (ignoring Data.json suffix)
        //         if (!meta) {
        //             const fileBase = file
        //                 .replace(/Data\.json$/i, '')
        //                 .toLowerCase();
        //             meta = councilMeta.find(
        //                 (c) => c.fileName.trim().toLowerCase() === fileBase
        //             );
        //         }
        //         councils.push({
        //             councilName: json.councilName,
        //             fileName: file,
        //             baseUrl: meta ? meta.baseUrl : '',
        //         });
        //     } catch (err) {
        //         // skip files that can't be read/parsed
        //     }
        // }
        // res.json(councils);

        // POST VERCEL CODE
        const { blobs } = await list();
        const councilBlobs = blobs.filter((b) =>
            b.pathname.endsWith('Data.json')
        );
        const councils = [];
        for (const blob of councilBlobs) {
            try {
                const json = await fetch(blob.url).then((res) => {
                    return res.json();
                });

                // Try to match by councilName (case-insensitive, trimmed)
                let meta = councilMeta.find(
                    (c) =>
                        c.councilName.trim().toLowerCase() ===
                        json.councilName.trim().toLowerCase()
                );
                // If not found, try matching by fileName (ignoring Data.json suffix)
                if (!meta) {
                    const fileBase = blob.pathname
                        .replace(/Data\.json$/i, '')
                        .toLowerCase();
                    meta = councilMeta.find(
                        (c) => c.fileName.trim().toLowerCase() === fileBase
                    );
                }

                councils.push({
                    councilName: json.councilName,
                    fileName: blob.pathname,
                    fileUrl: blob.url,
                    baseUrl: meta ? meta.baseUrl : '',
                });
            } catch (err) {
                // skip files that can't be read/parsed
            }
        }
        res.json(councils);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list councils.' });
    }
});

// Get data for a specific council
// this api call is basically redundant after vercel implemented
app.get('/api/council/:file', async (req, res) => {
    try {
        // pre vercel code
        const filePath = path.join(OUT_DIR, req.params.file);
        const data = await fs.readFile(filePath, 'utf-8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(404).json({ error: 'Council not found.' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// vercel cron job
// secured with cron secret
app.get('/api/updateData', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (
        !process.env.CRON_SECRET ||
        authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        res.status(401).json({ success: false });
    } else {
        try {
            const success = await updateVercelReformAttendanceData();
            console.log('successfully updated councils');
            res.status(200).json(success);
        } catch (err) {
            res.status(500).json({ success: false, err: err });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
