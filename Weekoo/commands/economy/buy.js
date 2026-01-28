const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Purchase an item from the shop.')
        .addStringOption(opt => 
            opt.setName('item')
                .setDescription('Select an item to buy')
                .setRequired(true)
                .setAutocomplete(true) // This enables the list!
        )
        .addIntegerOption(opt => opt.setName('amount').setDescription('How many to buy?').setMinValue(1)),

    // --- AUTOCOMPLETE LOGIC ---
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        
        try {
            // Fetch items from DB that aren't locked
            const res = await db.query('SELECT name FROM items WHERE is_locked = FALSE');
            const items = res.rows.map(row => row.name);

            // Filter items based on what the user has typed so far
            const filtered = items.filter(choice => choice.toLowerCase().includes(focusedValue));
            
            // Discord allows a max of 25 suggestions
            await interaction.respond(
                filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
            );
        } catch (err) {
            console.error('Autocomplete Error:', err);
        }
    },

    // --- EXECUTE LOGIC ---
    async execute(interaction) {
        const userId = interaction.user.id;
        const itemName = interaction.options.getString('item');
        const quantityToBuy = interaction.options.getInteger('amount') || 1;

        try {
            // Fetch Item Data
            const itemRes = await db.query('SELECT * FROM items WHERE name = $1', [itemName]);
            if (itemRes.rows.length === 0) {
                return interaction.reply({ content: "I don't recognize that item. Please select one from the list!", flags: [MessageFlags.Ephemeral] });
            }
            
            const item = itemRes.rows[0];
            const totalPrice = item.price * quantityToBuy;

            // Balance Check
            const userRes = await db.query('SELECT weekoins FROM users WHERE discord_id = $1', [userId]);
            const balance = userRes.rows[0]?.weekoins || 0;

            if (balance < totalPrice) {
                return interaction.reply({ content: `You need <:weekoin:1465807554927132883> ${totalPrice.toLocaleString()} but you only have <:weekoin:1465807554927132883> ${balance.toLocaleString()}.`, flags: [MessageFlags.Ephemeral] });
            }

            // Inventory Limit Check
            const invRes = await db.query('SELECT quantity FROM inventories WHERE user_id = $1 AND item_id = $2', [userId, item.id]);
            const currentOwned = invRes.rows[0]?.quantity || 0;

            if (currentOwned + quantityToBuy > item.max_inventory) {
                return interaction.reply({ content: `You can only have **${item.max_inventory}** of this. You already own **${currentOwned}**.`, flags: [MessageFlags.Ephemeral] });
            }

            // Transaction
            await db.query('UPDATE users SET weekoins = weekoins - $1 WHERE discord_id = $2', [totalPrice, userId]);
            await db.query(
                'INSERT INTO inventories (user_id, item_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = inventories.quantity + $3',
                [userId, item.id, quantityToBuy]
            );

            await interaction.reply(`🛒 You bought **${quantityToBuy}x ${item.emoji} ${item.name}**!`);

        } catch (err) {
            console.error(err);
            await interaction.reply({ content: "The store is having technical difficulties.", flags: [MessageFlags.Ephemeral] });
        }
    },
};