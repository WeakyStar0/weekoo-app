const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');
const { getXpNeeded } = require('../../utils/leveling');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Manage your Weekoo profile.')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View your or someone else\'s profile.')
                .addUserOption(opt => opt.setName('target').setDescription('The user to view')))
        .addSubcommand(sub =>
            sub.setName('edit')
                .setDescription('Edit your profile description.')
                .addStringOption(opt => opt.setName('description').setDescription('Your new profile description').setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('birthday')
                .setDescription('Set your birthday.')
                .addIntegerOption(opt => opt.setName('month').setDescription('Month (1-12)').setRequired(true))
                .addIntegerOption(opt => opt.setName('day').setDescription('Day (1-31)').setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const discordId = interaction.user.id;
        const BOT_ID = '1465770404508340295';
        const RPG_TITLE_EMOJIS = '<:w_:1467990168224137308><:e_:1467990186745925695><:e_:1467990186745925695><:k_:1467990202835537950><:o_:1467990217704079573><:o_:1467990217704079573> <:r_:1467990234275909663><:p_:1467990254958022778><:g_:1467990272263721023>';

        // Ensure user exists
        if (subcommand !== 'view' || (interaction.options.getUser('target')?.id !== BOT_ID)) {
            await db.query(
                'INSERT INTO users (discord_id, username) VALUES ($1, $2) ON CONFLICT (discord_id) DO NOTHING',
                [discordId, interaction.user.username]
            );
        }

        if (subcommand === 'edit') {
            const newDesc = interaction.options.getString('description');
            await db.query('UPDATE users SET description = $1 WHERE discord_id = $2', [newDesc, discordId]);
            return interaction.reply({ content: '✅ Description updated!', flags: [MessageFlags.Ephemeral] });
        }

        if (subcommand === 'birthday') {
            const day = interaction.options.getInteger('day');
            const month = interaction.options.getInteger('month');
            await db.query('UPDATE users SET birthday_day = $1, birthday_month = $2 WHERE discord_id = $3', [day, month, discordId]);
            return interaction.reply({ content: `🎂 Birthday set to **${month}/${day}**!`, flags: [MessageFlags.Ephemeral] });
        }

        if (subcommand === 'view') {
            const target = interaction.options.getUser('target') || interaction.user;

            // --- WEEKKOO EASTER EGG ---
            if (target.id === BOT_ID) {
                const botEmbed = new EmbedBuilder()
                    .setColor('#7300ff')
                    .setTitle(`👑 ${target.username} (Me :D)`)
                    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                    .setDescription('I do not earn Weekoins; I am the Weekoins.')
                    .addFields(
                        { name: '💰 Weekoins', value: '<:weekoin:1465807554927132883> ∞ (1.79e+308)', inline: true },
                        { name: '⭐ Level', value: 'Lvl 999 (MAX)', inline: true },
                        { name: '🎂 Birthday', value: '📅 27/1', inline: true },
                        {
                            name: RPG_TITLE_EMOJIS,
                            value: '• **⚔️:** God Slayer (∞ DMG)\n• **⛏️:** World Breaker (∞ Luck)\n• **🪖:** Admin Cloak (∞ Armor)\n• **🪬:** git push --force (+∞% everything)',
                            inline: false
                        },
                        { name: '🆔 ID', value: BOT_ID, inline: false }
                    )
                    .setFooter({ text: 'Warning: Values too high for standard DB storage.' })
                    .setTimestamp();

                return interaction.reply({ embeds: [botEmbed] });
            }

            // --- NORMAL USER PROFILE WITH JOINED EQUIPMENT ---
            const res = await db.query(`
                SELECT u.*, 
                    w.name as w_name, w.emoji as w_emoji, w.main_stat_value as w_v,
                    p.name as p_name, p.emoji as p_emoji, p.main_stat_value as p_v,
                    a.name as a_name, a.emoji as a_emoji, a.main_stat_value as a_v,
                    t.name as t_name, t.emoji as t_emoji, t.main_stat_value as t_v, t.stat_modifier_type as t_type
                FROM users u
                LEFT JOIN items w ON u.weapon_id = w.id
                LEFT JOIN items p ON u.pickaxe_id = p.id
                LEFT JOIN items a ON u.armor_id = a.id
                LEFT JOIN items t ON u.trinket_id = t.id
                WHERE u.discord_id = $1
            `, [target.id]);

            if (res.rows.length === 0) {
                return interaction.reply({ content: "That user doesn't have a profile yet!", flags: [MessageFlags.Ephemeral] });
            }

            const data = res.rows[0];

            let totalDmg = (data.base_damage || 10) + (data.w_v || 0);
            let totalDef = (data.base_defense || 0) + (data.a_v || 0);
            let totalLuck = (data.base_luck || 1) + (data.p_v || 0);
            let totalMagic = (data.base_magic_damage || 5);

            if (data.t_type === 'damage') totalDmg = Math.floor(totalDmg * (1 + (data.t_v / 100)));
            if (data.t_type === 'defense') totalDef = Math.floor(totalDef * (1 + (data.t_v / 100)));
            if (data.t_type === 'luck') totalLuck = Math.floor(totalLuck * (1 + (data.t_v / 100)));

            const bday = data.birthday_day ? `📅 ${data.birthday_day}/${data.birthday_month}` : 'Not set';
            const xpNeeded = getXpNeeded(data.level || 1);

            const weaponDesc = data.w_name ? `${data.w_emoji} ${data.w_name} (+${data.w_v})` : 'No weapon';
            const pickaxeDesc = data.p_name ? `${data.p_emoji} ${data.p_name} (+${data.p_v})` : 'No pickaxe';
            const armorDesc = data.a_name ? `${data.a_emoji} ${data.a_name} (+${data.a_v})` : 'No armor';
            const trinketDesc = data.t_name ? `${data.t_emoji} ${data.t_name} (+${data.t_v}% ${data.t_type})` : 'No trinket';

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`<:star_decor:1468013007748726835> ${target.username}'s Profile <:star_decor:1468013007748726835>`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setDescription(data.description)
                .addFields(
                    { name: '💰 Weekoins', value: `<:weekoin:1465807554927132883> ${data.weekoins.toLocaleString()}`, inline: true },
                    { name: '⭐ Level', value: `Lvl **${data.level}**\n(${data.xp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP)`, inline: true },
                    { name: '🎂 Birthday', value: bday, inline: true },
                    {
                        name: RPG_TITLE_EMOJIS,
                        value:
                            `• **⚔️:** ${weaponDesc}\n` +
                            `• **⛏️:** ${pickaxeDesc}\n` +
                            `• **🪖:** ${armorDesc}\n` +
                            `• **🪬:** ${trinketDesc}`,
                        inline: true
                    },
                    {
                        name: '📊 Current Stats',
                        value:
                            `**DMG:** ${totalDmg} / **MAGIC:** ${totalMagic}\n` +
                            `**DEF:** ${totalDef}\n` +
                            `**LUCK:** ${totalLuck}\n` +
                            ``,
                        inline: true
                    },
                    { name: '🆔 ID', value: data.discord_id, inline: false }
                )
                .setFooter({ text: 'Weekoo World' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
};