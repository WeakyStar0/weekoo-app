const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const BACKGROUND_URL = 'https://i.pinimg.com/1200x/57/f5/1e/57f51e4fba51fde416e0442b032f30d9.jpg';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Calculate the love percentage between two users.')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The person to ship.')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('user2')
                .setDescription('Optional: A second person (defaults to you).')),

    async execute(interaction) {
        await interaction.deferReply();

        const user1 = interaction.user;
        const user2 = interaction.options.getUser('user2') || interaction.options.getUser('target');

        const target1 = interaction.options.getUser('user2') ? interaction.options.getUser('target') : user1;
        const target2 = user2;

        // --- CHANGE IS HERE: TRUE RANDOM ---
        // This generates a random number between 0 and 100 every single time.
        const loveIndex = Math.floor(Math.random() * 101);

        let comment;
        if (loveIndex === 0) {
            comment = "Total strangers. Or worse... enemies. <:konata_smug:1465824988014841940>";
        } else if (loveIndex === 69) {
            comment = "Nice. ( ͡° ͜ʖ ͡°)";
        } else if (loveIndex === 100) {
            comment = "PERFECTION! PLAN THE WEDDING! 💍💖🔥";
        } else if (loveIndex < 10) {
            comment = "Disaster waiting to happen. <:konata_bwa:1466140778492465255>";
        } else if (loveIndex < 25) {
            comment = "I sense a restraining order in the future. <:konata_bwa:1466140778492465255>";
        } else if (loveIndex < 40) {
            comment = "Friendzone level: Expert. <a:konata_gaming:1465824999033143337>";
        } else if (loveIndex < 55) {
            comment = "It could work... with a lot of therapy. <:konata_idea:1465824989528981547>";
        } else if (loveIndex < 75) {
            comment = "Looking good! Definite chemistry here. <:konata_excited:1465824985720291523>";
        } else if (loveIndex < 90) {
            comment = "Spicy! Get a room you two. <a:konata_dupe:1466140780367319110>";
        } else {
            // Covers 90-99%
            comment = "A match made in heaven! <a:konata_wow:1466140787543769160>";
        }

        const canvas = createCanvas(700, 250);
        const ctx = canvas.getContext('2d');

        // --- BACKGROUND ---
        try {
            const bg = await loadImage(BACKGROUND_URL);

            const hRatio = canvas.width / bg.width;
            const vRatio = canvas.height / bg.height;
            const ratio = Math.max(hRatio, vRatio);

            const centerShift_x = (canvas.width - bg.width * ratio) / 2;
            const centerShift_y = (canvas.height - bg.height * ratio) / 2;

            ctx.drawImage(bg, 0, 0, bg.width, bg.height, centerShift_x, centerShift_y, bg.width * ratio, bg.height * ratio);

            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } catch (e) {
            ctx.fillStyle = '#23272A';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // --- DRAW THE HEART ---
        const x = canvas.width / 2;
        const y = canvas.height / 2 + 10;
        const w = 120;
        const h = 85;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y - h / 3);
        ctx.bezierCurveTo(x + w / 2, y - h, x + w, y + h / 3, x, y + h);
        ctx.bezierCurveTo(x - w, y + h / 3, x - w / 2, y - h, x, y - h / 3);

        ctx.fillStyle = '#FF0000';
        ctx.fill();
        ctx.restore();

        // --- PERCENTAGE TEXT ---
        ctx.font = 'bold 40px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${loveIndex}%`, x, y + 5);

        // --- WATERMARK ---
        ctx.font = 'italic 15px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.textAlign = 'right';
        ctx.fillText('made with: weekoo#7531', canvas.width - 10, canvas.height - 10);

        // --- AVATARS ---
        const avatar1 = await loadImage(target1.displayAvatarURL({ extension: 'png' }));
        const avatar2 = await loadImage(target2.displayAvatarURL({ extension: 'png' }));

        // Left
        ctx.save();
        ctx.beginPath();
        ctx.arc(150, 125, 100, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar1, 50, 25, 200, 200);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.restore();

        // Right
        ctx.save();
        ctx.beginPath();
        ctx.arc(550, 125, 100, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar2, 450, 25, 200, 200);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.restore();

        const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'ship.png' });

        await interaction.editReply({
            content: `💗 **Matchmaking: ${target1.username} X ${target2.username}**\n${comment}`,
            files: [attachment]
        });
    },
};