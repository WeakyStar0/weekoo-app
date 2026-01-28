const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../utils/db');

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

        // 1. ENSURE USER EXISTS (Only for humans)
        if (subcommand !== 'view' || (interaction.options.getUser('target')?.id !== BOT_ID)) {
            await db.query(
                'INSERT INTO users (discord_id, username) VALUES ($1, $2) ON CONFLICT (discord_id) DO NOTHING',
                [discordId, interaction.user.username]
            );
        }

        // 2. HANDLE EDIT/BIRTHDAY (Skipping code for brevity, keep your existing logic here...)
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

        // 3. HANDLE VIEW (With the Weekoo Easter Egg)
        if (subcommand === 'view') {
            const target = interaction.options.getUser('target') || interaction.user;

            // --- WEEKKOO EASTER EGG ---
            if (target.id === BOT_ID) {
                const botEmbed = new EmbedBuilder()
                    .setColor('#7300ff') // Gold color
                    .setTitle(`👑 ${target.username} (Me :D)`)
                    .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                    .setDescription('I do not earn Weekoins; I am the Weekoins.')
                    .addFields(
                        { name: '💰 Weekoins', value: '<:weekoin:1465807554927132883> ∞ (1.79e+308)', inline: true },
                        { name: '⭐ Level', value: 'Lvl 999 (MAX)', inline: true },
                        { name: '🎂 Birthday', value: '📅 27/1', inline: true },
                        { name: '💎 Jackpots', value: `🏆 I am the jackpot`, inline: true },
                        { name: '🆔 ID', value: BOT_ID, inline: false }
                    )
                    .setFooter({ text: 'Warning: Values too high for standard DB storage.' })
                    .setTimestamp();

                return interaction.reply({ embeds: [botEmbed] });
            }

            // --- NORMAL USER PROFILE ---
            const res = await db.query('SELECT * FROM users WHERE discord_id = $1', [target.id]);

            if (res.rows.length === 0) {
                return interaction.reply({ content: "That user doesn't have a profile yet!", flags: [MessageFlags.Ephemeral] });
            }

            const data = res.rows[0];
            const bday = data.birthday_day ? `📅 ${data.birthday_day}/${data.birthday_month}` : 'Not set';

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`${target.username}'s Profile`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }))
                .setDescription(data.description)
                .addFields(
                    { name: '💰 Weekoins', value: `<:weekoin:1465807554927132883> ${data.weekoins.toLocaleString()}`, inline: true },
                    { name: '⭐ Level', value: `Lvl ${data.level}`, inline: true },
                    { name: '🎂 Birthday', value: bday, inline: true },
                    { name: '💎 Jackpots', value: `🏆 ${data.jackpots_won}`, inline: true },
                    { name: '🆔 ID', value: data.discord_id, inline: false }
                )
                .setFooter({ text: 'Weekoo World' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }
    },
};