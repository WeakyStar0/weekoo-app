const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sell')
        .setDescription('Sell your blocks and materials for Weekoins.')
        .addStringOption(opt =>
            opt.setName('item')
                .setDescription('The item you want to sell')
                .setRequired(true)
                .setAutocomplete(true))
        .addIntegerOption(opt =>
            opt.setName('amount')
                .setDescription('How many to sell? (Leave empty to sell all)')
                .setMinValue(1)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        try {
            const res = await db.query(`
                SELECT i.name, i.item_type, i.emoji 
                FROM inventories inv
                JOIN items i ON inv.item_id = i.id
                WHERE inv.user_id = $1 
                AND i.item_type IN ('block', 'material') 
                AND inv.quantity > 0
            `, [interaction.user.id]);

            const choices = res.rows.filter(row => row.name.toLowerCase().includes(focusedValue));

            await interaction.respond(
                choices.slice(0, 25).map(choice => ({
                    name: `${choice.name} (${choice.item_type})`,
                    value: choice.name
                }))
            );
        } catch (err) {
            console.error('Sell Autocomplete Error:', err);
        }
    },

    async execute(interaction) {
        const userId = interaction.user.id;
        const itemName = interaction.options.getString('item');
        let amountInput = interaction.options.getInteger('amount');

        try {
            const res = await db.query(`
                SELECT i.id, i.name, i.item_type, i.price, i.emoji, inv.quantity
                FROM items i
                LEFT JOIN inventories inv ON i.id = inv.item_id AND inv.user_id = $1
                WHERE i.name = $2
            `, [userId, itemName]);

            if (res.rows.length === 0) return interaction.reply({ content: "I don't know what that item is.", flags: [MessageFlags.Ephemeral] });

            const item = res.rows[0];
            const allowedTypes = ['block', 'material'];

            if (!allowedTypes.includes(item.item_type)) {
                return interaction.reply({
                    content: `❌ You can only sell **Blocks** and **Materials**. Equipment cannot be sold here.`,
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (!item.quantity || item.quantity <= 0) {
                return interaction.reply({ content: "You don't have any of that to sell!", flags: [MessageFlags.Ephemeral] });
            }

            let finalAmount = 0;
            let feedbackNote = "";

            if (!amountInput) {
                finalAmount = item.quantity;
            } else if (amountInput > item.quantity) {
                finalAmount = item.quantity;
                feedbackNote = `(You only had **${item.quantity}**, so I sold them all)`;
            } else {
                finalAmount = amountInput;
            }

            // Calculate Payment
            // Note: If you want Materials to sell for a different ratio (e.g. 50% of buy price), change logic here.
            // Currently it sells for 100% of the 'price' value in DB.
            const totalPay = item.price * finalAmount;

            await db.query('BEGIN');

            // A. Remove items
            await db.query(
                'UPDATE inventories SET quantity = quantity - $1 WHERE user_id = $2 AND item_id = $3',
                [finalAmount, userId, item.id]
            );

            // B. Add money
            await db.query(
                'UPDATE users SET weekoins = weekoins + $1 WHERE discord_id = $2',
                [totalPay, userId]
            );

            // C. Cleanup empty rows
            await db.query('DELETE FROM inventories WHERE user_id = $1 AND item_id = $2 AND quantity <= 0', [userId, item.id]);

            await db.query('COMMIT'); // Save changes

            // 5. Reply
            await interaction.reply(
                `💰 Sold **${finalAmount}x ${item.emoji} ${item.name}** for **<:weekoin:1465807554927132883> ${totalPay.toLocaleString()}**!\n${feedbackNote}`
            );

        } catch (err) {
            await db.query('ROLLBACK'); // Undo changes if error
            console.error(err);
            await interaction.reply({ content: "The market is closed due to a database error.", flags: [MessageFlags.Ephemeral] });
        }
    },
};