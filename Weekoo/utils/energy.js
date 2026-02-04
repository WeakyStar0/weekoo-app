const db = require('./db');

async function checkAndResetEnergy(userId) {
    const res = await db.query('SELECT energy, last_energy_reset FROM users WHERE discord_id = $1', [userId]);
    if (res.rows.length === 0) return 0;

    const { energy, last_energy_reset } = res.rows[0];
    const now = new Date();
    const lastReset = new Date(last_energy_reset);
    const diff = now - lastReset;
    const cooldown = 60 * 60 * 1000; // 1 Hour

    if (diff >= cooldown) {
        // Reset to 100
        await db.query('UPDATE users SET energy = 100, last_energy_reset = NOW() WHERE discord_id = $1', [userId]);
        return 100;
    }

    return energy;
}

module.exports = { checkAndResetEnergy };