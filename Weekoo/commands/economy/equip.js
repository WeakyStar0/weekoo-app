const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');

const SLOT_MAP = {
    'weapon': 'weapon_id',
    'pickaxe': 'pickaxe_id',
    'armor': 'armor_id',
    'trinket': 'trinket_id'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('equip')
        .setDescription('Equip an item from your inventory.')
        .addStringOption(opt =>
            opt.setName('item')
                .setDescription('The item you want to equip')
                .setRequired(true)
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        try {
            const res = await db.query(`
                SELECT i.name 
                FROM inventories inv
                JOIN items i ON inv.item_id = i.id
                WHERE inv.user_id = $1 
                AND i.item_type IN ('weapon', 'pickaxe', 'armor', 'trinket') 
                AND inv.quantity > 0
            `, [interaction.user.id]);

            const choices = res.rows.map(row => row.name);
            const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedValue));
            await interaction.respond(filtered.slice(0, 25).map(choice => ({ name: choice, value: choice })));
        } catch (err) {
            console.error('Equip Autocomplete Error:', err);
        }
    },

    async execute(interaction) {
        const userId = interaction.user.id;
        const itemName = interaction.options.getString('item');

        try {
            const res = await db.query(`
                SELECT i.*, inv.quantity, u.weapon_id, u.pickaxe_id, u.armor_id, u.trinket_id
                FROM items i
                JOIN inventories inv ON i.id = inv.item_id
                JOIN users u ON u.discord_id = inv.user_id
                WHERE inv.user_id = $1 AND i.name = $2 AND inv.quantity > 0
            `, [userId, itemName]);

            if (res.rows.length === 0) {
                return interaction.reply({
                    content: "❌ You don't own that item or it isn't equipable.",
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const item = res.rows[0];
            const slotColumn = SLOT_MAP[item.item_type];

            if (res.rows[0][slotColumn] === item.id) {
                return interaction.reply({
                    content: `ℹ️ You already have **${item.emoji} ${item.name}** equipped in your **${item.item_type}** slot.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            await db.query(`UPDATE users SET ${slotColumn} = $1 WHERE discord_id = $2`, [item.id, userId]);

            let statBonus = item.item_type === 'trinket'
                ? `(+${item.main_stat_value}% ${item.stat_modifier_type})`
                : `(+${item.main_stat_value} ${item.stat_modifier_type})`;

            await interaction.reply({
                content: `🛡️ You have equipped **${item.emoji} ${item.name}** to your **${item.item_type}** slot! ${statBonus}`,
                flags: [MessageFlags.Ephemeral]
            });

        } catch (err) {
            console.error('Equip Error:', err);
            await interaction.reply({
                content: "❌ Failed to equip item. There was a database error.",
                flags: [MessageFlags.Ephemeral]
            });
        }
    },
};