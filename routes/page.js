/**
 * Kymor Page Routes — Public Hub Pages
 */
import express from 'express';
import prisma from '../lib/prisma.js';

const router = express.Router();

// Public hub page (e.g., /p/my-hub-slug)
router.get('/:slug', async (req, res) => {
    try {
        const hub = await prisma.hub.findFirst({
            where: { pageSlug: req.params.slug, pagePublished: true },
            select: {
                name: true, shortId: true, pageTitle: true,
                pageDescription: true, pageAccentColor: true,
                pageKeyMode: true, pageBuyLink: true, pageElements: true,
                rewardsEnabled: true
            }
        });

        if (!hub) return res.status(404).send('Page not found.');

        if (req.headers.accept?.includes('application/json')) {
            return res.json(hub);
        }

        if (hub.rewardsEnabled) {
            return res.redirect(`/reward/${hub.shortId}`);
        }

        res.json(hub);
    } catch (err) {
        res.status(500).send('Server error.');
    }
});

export default router;