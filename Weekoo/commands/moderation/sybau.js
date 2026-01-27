const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sybau')
        .setDescription('Mutes a user (Timeout).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(option => 
            option.setName('target').setDescription('The user to mute').setRequired(true))
        .addIntegerOption(option => 
            option.setName('duration')
                .setDescription('Duration in minutes')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('reason').setDescription('Reason for the mute')),
    async execute(interaction) {
        const target = interaction.options.getMember('target');
        const duration = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!target.moderatable) {
            return interaction.reply({ content: '❌ I cannot mute this user.', ephemeral: true });
        }

        // Convert minutes to milliseconds
        await target.timeout(duration * 60 * 1000, reason);
        await interaction.reply({ content: `🤫 **${target.user.tag}** SYBAU for ${duration} minutes. \n**Reason:** ${reason}` });
    },
};