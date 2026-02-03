const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sell')
        .setDescription('Sell your blocks for Weekoins.')
        .addStringOption(opt =>
            opt.setName('item')
                .setDescription('The block you want to sell')
                .setRequired(true)
                .setAutocomplete(true))
        .addIntegerOption(opt =>
            opt.setName('amount')
                .setDescription('How many to sell?')
                .setMinValue(1)),

    // AUTOCOMPLETE: Only shows blocks the user actually OWNS
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        try {
            const res = await db.query(`
                SELECT i.name 
                FROM inventories inv
                JOIN items i ON inv.item_id = i.id
                WHERE inv.user_id = $1 AND i.item_type = 'block' AND inv.quantity > 0
            `, [interaction.user.id]);

            const choices = res.rows.map(row => row.name);
            const filtered = choices.filter(choice => choice.toLowerCase().includes(focusedValue)); //filter here

            await interaction.respond(
                filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
            );
        } catch (err) {
            console.error('Sell Autocomplete Error:', err);
        }
    },

    async execute(interaction) {
        const userId = interaction.user.id;
        const itemName = interaction.options.getString('item');
        let amount = interaction.options.getInteger('amount') || 1;

        try {
            const res = await db.query(`
                SELECT i.id, i.name, i.item_type, i.price, i.emoji, inv.quantity
                FROM items i
                LEFT JOIN inventories inv ON i.id = inv.item_id AND inv.user_id = $1
                WHERE i.name = $2
            `, [userId, itemName]);

            if (res.rows.length === 0) return interaction.reply({ content: "I don't know what that item is.", flags: [MessageFlags.Ephemeral] });

            const item = res.rows[0];

            if (item.item_type !== 'block') {
                return interaction.reply({ content: `❌ Trying to scam me? You can only sell **blocks**!`, flags: [MessageFlags.Ephemeral] });
            }

            if (!item.quantity || item.quantity < amount) {
                // Higher = sell all
                if (item.quantity > 0) {
                    amount = item.quantity;
                } else {
                    return interaction.reply({ content: "You don't have any of that to sell!", flags: [MessageFlags.Ephemeral] });
                }
            }

            const totalPay = item.price * amount;

            //Remove items from inventory
            await db.query(
                'UPDATE inventories SET quantity = quantity - $1 WHERE user_id = $2 AND item_id = $3',
                [amount, userId, item.id]
            );

            //Give coins to user
            await db.query(
                'UPDATE users SET weekoins = weekoins + $1 WHERE discord_id = $2',
                [totalPay, userId]
            );

            //Cleanup: Delete inventory row if quantity reaches 0
            await db.query('DELETE FROM inventories WHERE user_id = $1 AND item_id = $2 AND quantity <= 0', [userId, item.id]);

            await interaction.reply(`💰 Sold **${amount}x ${item.emoji} ${item.name}** for **<:weekoin:1465807554927132883> ${totalPay.toLocaleString()}**!`);

        } catch (err) {
            console.error(err);
            await interaction.reply({ content: "The market is closed due to a database error.", flags: [MessageFlags.Ephemeral] });
        }
    },
};