const db = require('./db');

/**
 * Ensures a user exists in the DB. If they are new, gives them the starter kit.
 * @returns The user's database object
 */
async function ensureUserExists(discordId, username) {
    // 1. Attempt to insert the user
    const insertRes = await db.query(
        'INSERT INTO users (discord_id, username) VALUES ($1, $2) ON CONFLICT (discord_id) DO NOTHING RETURNING *',
        [discordId, username]
    );

    if (insertRes.rows.length > 0) {
        try {
            const starters = await db.query(
                "SELECT id, name, item_type FROM items WHERE name IN ('Stone Sword', 'Stone Pickaxe', 'Leather Vest')"
            );

            let weaponId = null, pickaxeId = null, armorId = null;

            for (const item of starters.rows) {
                await db.query(
                    'INSERT INTO inventories (user_id, item_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = inventories.quantity + 1',
                    [discordId, item.id]
                );

                if (item.item_type === 'weapon') weaponId = item.id;
                if (item.item_type === 'pickaxe') pickaxeId = item.id;
                if (item.item_type === 'armor') armorId = item.id;
            }

            await db.query(
                'UPDATE users SET weapon_id = $1, pickaxe_id = $2, armor_id = $3 WHERE discord_id = $4',
                [weaponId, pickaxeId, armorId, discordId]
            );
            
            console.log(`[Registry] Starter kit issued to new user: ${username}`);
            return insertRes.rows[0];
        } catch (starterErr) {
            console.error("[Registry] Failed to issue starter kit:", starterErr);
        }
    }

    const userRes = await db.query('SELECT * FROM users WHERE discord_id = $1', [discordId]);
    return userRes.rows[0];
}

module.exports = { ensureUserExists };