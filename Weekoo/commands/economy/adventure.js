const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../../utils/db');
const { checkAndResetEnergy } = require('../../utils/energy');
const { addXp } = require('../../utils/leveling');
const { getWalkingScene, getMiningScene } = require('../../utils/animations');
const { startBattle } = require('../utility/battle'); 

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adventure')
        .setDescription('Go on an adventure!')
        .addSubcommand(sub => sub.setName('walk').setDescription('Explore the world (5 Energy)'))
        .addSubcommand(sub => sub.setName('mine').setDescription('Mine for resources (10 Energy)')),

    async execute(interaction) {
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();

        // Initialize Session Stats
        let sessionStats = { coins: 0, xp: 0, items: 0 };

        if (subcommand === 'walk') {
            // isFirstRun = true
            await handleWalkCycle(interaction, userId, sessionStats, true);
        }

        if (subcommand === 'mine') {
            // isFirstRun = true
            await handleMiningCycle(interaction, userId, sessionStats, true);
        }
    },
};

// --- WALKING LOGIC ---
async function handleWalkCycle(interaction, userId, stats, isFirstRun) {
    const ENERGY_COST = 5;

    // 1. Check Energy
    let currentEnergy = await checkAndResetEnergy(userId);
    if (currentEnergy < ENERGY_COST) {
        const msg = `❌ **You are exhausted!**\nEnergy: ${currentEnergy}/100\nWait for your daily reset.`;
        
        // CRASH FIX: Check if we can Update, otherwise Reply
        if (interaction.isMessageComponent()) return interaction.update({ content: msg, embeds: [], components: [] });
        else return interaction.reply({ content: msg, flags: [MessageFlags.Ephemeral] });
    }

    // 2. Fetch Data
    const pDataRes = await db.query(`
        SELECT u.*, d.name as dim_name, d.emoji as dim_emoji,
            w.main_stat_value as w_v, a.main_stat_value as a_v,
            t.main_stat_value as t_v, t.stat_modifier_type as t_type
        FROM users u
        JOIN dimensions d ON u.dimension_id = d.id
        LEFT JOIN items w ON u.weapon_id = w.id
        LEFT JOIN items a ON u.armor_id = a.id
        LEFT JOIN items t ON u.trinket_id = t.id
        WHERE u.discord_id = $1
    `, [userId]);

    const userData = pDataRes.rows[0];
    const dimension = userData.dim_name;

    // 3. Battle Check
    const battleChance = dimension === 'Overworld' ? 0.25 : 0.50;
    if (Math.random() < battleChance) {
        const enemyRes = await db.query('SELECT * FROM enemies WHERE dimension_id = $1 ORDER BY RANDOM() LIMIT 1', [userData.dimension_id]);
        if (enemyRes.rows.length > 0) {
            const enemy = enemyRes.rows[0];
            let totalDmg = (userData.base_damage || 10) + (userData.w_v || 0);
            let totalDef = (userData.base_defense || 0) + (userData.a_v || 0);
            if (userData.t_type === 'damage') totalDmg = Math.floor(totalDmg * (1 + (userData.t_v / 100)));
            if (userData.t_type === 'defense') totalDef = Math.floor(totalDef * (1 + (userData.t_v / 100)));

            const playerStats = { maxHp: (userData.base_hp || 100) + (userData.level - 1), totalDmg, totalDef };
            
            // Prepare for battle (Defer based on interaction type)
            if (interaction.isMessageComponent()) await interaction.deferUpdate(); 
            else await interaction.deferReply();

            return await startBattle(interaction, playerStats, enemy);
        }
    }

    // 4. Walking Animation
    await db.query('UPDATE users SET energy = energy - $1 WHERE discord_id = $2', [ENERGY_COST, userId]);
    const remainingEnergy = currentEnergy - ENERGY_COST;

    const walkingArt = getWalkingScene(dimension, true); 
    const walkEmbed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(`🚶 Exploring: ${dimension}`)
        .setDescription(`${walkingArt}\n\n*Walking through the lands...*`)
        .setFooter({ text: `Energy: ${remainingEnergy}/100` });

    // CRASH FIX: Explicit check
    if (interaction.isMessageComponent()) await interaction.update({ embeds: [walkEmbed], components: [] });
    else await interaction.reply({ embeds: [walkEmbed], components: [] });

    await wait(2500); 

    // 5. Rewards
    const xpGain = 5;
    const coinGain = Math.floor(Math.random() * 20) + 10;
    await db.query('UPDATE users SET weekoins = weekoins + $1 WHERE discord_id = $2', [coinGain, userId]);
    await addXp(userId, xpGain, interaction); 

    stats.coins += coinGain;
    stats.xp += xpGain;

    const encounters = ["You found a lost pouch of coins!", "A slime bumped into you and dropped loot.", "You found gold in the grass."];
    const encounterMsg = encounters[Math.floor(Math.random() * encounters.length)];
    const idleArt = getWalkingScene(dimension, false); 

    const resultEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(`📍 Adventure Result`)
        .setDescription(`${idleArt}\n\n**${encounterMsg}**\n\nFound: **<:weekoin:1465807554927132883> ${coinGain}** | **🧪 ${xpGain} XP**`)
        .addFields({ name: '🎒 Session Summary', value: `💰 Coins: **${stats.coins}**\n🧪 XP: **${stats.xp}**`, inline: false })
        .setFooter({ text: `Energy: ${remainingEnergy}/100` });

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('walk_continue').setLabel('Continue (5⚡)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('walk_stop').setLabel('Go Home').setStyle(ButtonStyle.Secondary)
    );

    // .editReply works for both Reply and Update follow-ups
    const message = await interaction.editReply({ embeds: [resultEmbed], components: [btnRow] });

    try {
        const confirmation = await message.awaitMessageComponent({ filter: i => i.user.id === userId, time: 30000 });
        if (confirmation.customId === 'walk_continue') await handleWalkCycle(confirmation, userId, stats, false);
        else await confirmation.update({ content: "Adventure ended. Safe travels!", embeds: [], components: [] });
    } catch (e) {
        await interaction.editReply({ components: [] }).catch(() => {});
    }
}

// --- MINING LOGIC ---
async function handleMiningCycle(interaction, userId, stats, isFirstRun) {
    const ENERGY_COST = 5;

    let currentEnergy = await checkAndResetEnergy(userId);
    if (currentEnergy < ENERGY_COST) {
        const msg = `❌ **Exhausted!**\nEnergy: ${currentEnergy}/100. Mining takes heavy effort!`;
        
        // CRASH FIX: Check interaction type
        if (interaction.isMessageComponent()) return interaction.update({ content: msg, embeds: [], components: [] });
        else return interaction.reply({ content: msg, flags: [MessageFlags.Ephemeral] });
    }

    // Fetch User Data
    const userRes = await db.query(`
        SELECT u.*, d.id as dim_id, d.name as dim_name, d.emoji as dim_emoji,
        (SELECT main_stat_value FROM items WHERE id = u.pickaxe_id) as pick_luck
        FROM users u
        JOIN dimensions d ON u.dimension_id = d.id
        WHERE u.discord_id = $1
    `, [userId]);
    const userData = userRes.rows[0];
    const dimension = userData.dim_name;
    const playerLuck = (userData.base_luck || 1) + (userData.pick_luck || 0);

    // Deduct Energy
    await db.query('UPDATE users SET energy = energy - $1 WHERE discord_id = $2', [ENERGY_COST, userId]);
    const remainingEnergy = currentEnergy - ENERGY_COST;
    
    // Animation Frame 0
    const mineEmbed = new EmbedBuilder()
        .setColor('#717171')
        .setTitle(`⛏️ Mining in ${dimension}`)
        .setDescription(getMiningScene(dimension, 0, true)) 
        .setFooter({ text: `Energy: ${remainingEnergy}/100` });

    // CRASH FIX: Use correct method
    if (interaction.isMessageComponent()) await interaction.update({ embeds: [mineEmbed], components: [] });
    else await interaction.reply({ embeds: [mineEmbed], components: [] });
    
    await wait(1000);

    // Frame 1
    mineEmbed.setDescription(getMiningScene(dimension, 1, true));
    await interaction.editReply({ embeds: [mineEmbed] });
    await wait(1000);

    // Frame 2
    mineEmbed.setDescription(getMiningScene(dimension, 2, true));
    await interaction.editReply({ embeds: [mineEmbed] });
    await wait(1000);

    // Calculate Loot
    const lootRes = await db.query(`
        SELECT l.chance, l.min_qty, l.max_qty, i.id as item_id, i.name, i.emoji 
        FROM mining_loot l
        JOIN items i ON l.item_id = i.id
        WHERE l.dimension_id = $1
    `, [userData.dim_id]);

    let lootFound = [];
    let xpGain = 15;

    for (const drop of lootRes.rows) {
        const adjustedChance = parseFloat(drop.chance) + (playerLuck * 0.01);
        if (Math.random() <= adjustedChance) {
            const qty = Math.floor(Math.random() * (drop.max_qty - drop.min_qty + 1)) + drop.min_qty;
            lootFound.push({ id: drop.item_id, name: drop.name, emoji: drop.emoji, qty: qty });
            
            await db.query(
                'INSERT INTO inventories (user_id, item_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = inventories.quantity + $3',
                [userId, drop.item_id, qty]
            );
            stats.items += qty;
        }
    }

    await addXp(userId, xpGain, interaction);
    stats.xp += xpGain;

    // Show Results
    const resultList = lootFound.length > 0 
        ? lootFound.map(i => `+${i.qty} ${i.emoji} **${i.name}**`).join('\n')
        : "💨 *You found nothing but rubble...*";

    const resultArt = getMiningScene(dimension, 2, false); 

    const resultEmbed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`⛏️ Mining Complete`)
        .setDescription(`${resultArt}\n\n**Loot Obtained:**\n${resultList}\n\n**Rewards:**\n🧪 +${xpGain} XP`)
        .addFields({ name: '🎒 Session Summary', value: `📦 Items: **${stats.items}**\n🧪 Total XP: **${stats.xp}**`, inline: false })
        .setFooter({ text: `Energy: ${remainingEnergy}/100` });

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mine_continue').setLabel('Mine Again (5⚡)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('mine_stop').setLabel('Go Surface').setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.editReply({ embeds: [resultEmbed], components: [btnRow] });

    try {
        const confirmation = await message.awaitMessageComponent({ filter: i => i.user.id === userId, time: 30000 });
        if (confirmation.customId === 'mine_continue') await handleMiningCycle(confirmation, userId, stats, false);
        else await confirmation.update({ content: "Returned to surface.", embeds: [], components: [] });
    } catch (e) {
        await interaction.editReply({ components: [] }).catch(() => {});
    }
}