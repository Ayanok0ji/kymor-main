/**
 * Kymor Discord Bot — Full Command Suite
 * MySQL/Prisma | 20+ Commands | Interactive Embeds
 */
import { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import prisma from './lib/prisma.js';
import { generateKeyString, generateToken } from './lib/crypto.js';
import * as keyService from './services/keyService.js';
import * as hubService from './services/hubService.js';
import logger from './lib/logger.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const PREFIX = process.env.BOT_PREFIX || '!ky';

const success = (msg) => new EmbedBuilder().setColor(0x14b8a6).setDescription(`✅ ${msg}`).setTimestamp();
const error = (msg) => new EmbedBuilder().setColor(0xef4444).setDescription(`❌ ${msg}`);
const info = (title, desc) => new EmbedBuilder().setColor(0x3b82f6).setTitle(title).setDescription(desc).setTimestamp();

client.once('ready', () => { logger.bot(`Online as ${client.user.tag}`); console.log(`🤖 Bot online as ${client.user.tag}`); });

async function getCtx(guildId) {
    const srv = await prisma.discordServer.findUnique({ where: { guildId } });
    if (!srv) return null;
    const hub = await prisma.hub.findUnique({ where: { shortId: srv.activeHubId || '' } });
    return hub ? { srv, hub } : null;
}

client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.content.startsWith(PREFIX)) return;
    const args = msg.content.slice(PREFIX.length).trim().split(/ +/);
    const cmd = args.shift()?.toLowerCase();
    const gid = msg.guild?.id;
    if (!gid) return;

    // ── setup ──
    if (cmd === 'setup') {
        if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) return msg.reply({ embeds: [error('Admin only.')] });
        const apiKey = args[0];
        if (!apiKey) return msg.reply({ embeds: [error('Usage: `!ky setup <api_key>`')] });
        const user = await prisma.user.findFirst({ where: { apiKey } });
        if (!user) return msg.reply({ embeds: [error('Invalid API key.')] });
        const hubs = await prisma.hub.findMany({ where: { ownerId: user.id } });
        if (!hubs.length) return msg.reply({ embeds: [error('No hubs found.')] });
        await prisma.discordServer.upsert({ where: { guildId: gid }, update: { apiKey, activeHubId: hubs[0].shortId }, create: { guildId: gid, apiKey, activeHubId: hubs[0].shortId } });
        return msg.reply({ embeds: [success(`Linked to **${user.username}** → Hub: **${hubs[0].name}** (\`${hubs[0].shortId}\`)`)] });
    }

    if (cmd === 'setrole') {
        if (!msg.member.permissions.has(PermissionFlagsBits.Administrator)) return msg.reply({ embeds: [error('Admin only.')] });
        const type = args[0]; const roleId = args[1]?.replace(/[<@&>]/g, '');
        if (!type || !roleId) return msg.reply({ embeds: [error('Usage: `!ky setrole <manager|buyer> <@role>`')] });
        const data = type === 'manager' ? { managerRoleId: roleId } : { buyerRoleId: roleId };
        await prisma.discordServer.update({ where: { guildId: gid }, data });
        return msg.reply({ embeds: [success(`${type} role set to <@&${roleId}>`)] });
    }

    const ctx = await getCtx(gid);
    if (!ctx) return msg.reply({ embeds: [error('Server not linked. Run `!ky setup <api_key>` first.')] });
    const { srv, hub } = ctx;
    const hasManager = !srv.managerRoleId || msg.member.roles.cache.has(srv.managerRoleId) || msg.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!hasManager) return msg.reply({ embeds: [error('You need the manager role.')] });

    // ── gen ──
    if (cmd === 'gen' || cmd === 'generate') {
        const amount = parseInt(args[0]) || 1;
        const durH = parseInt(args[1]) || null;
        const note = args.slice(2).join(' ') || `Discord: ${msg.author.tag}`;
        const count = Math.min(amount, 50);
        const result = await keyService.createBulkKeys(hub.id, { amount: count, durationHours: durH, note });
        const embed = new EmbedBuilder().setColor(0x14b8a6).setTitle(`🔑 ${result.count} Key(s) Generated`).setTimestamp()
            .addFields({ name: 'Duration', value: durH ? `${durH}h` : 'Lifetime', inline: true }, { name: 'Hub', value: hub.name, inline: true });
        if (count <= 10) embed.setDescription(result.keys.map(k => `\`${k}\``).join('\n'));
        else embed.addFields({ name: 'Keys', value: `${count} keys generated. Use \`!ky export\` to get them all.` });
        try { await msg.author.send({ embeds: [embed] }); msg.reply({ embeds: [success('Keys sent to DMs.')] }); } catch { msg.reply({ embeds: [embed] }); }
    }

    // ── check ──
    else if (cmd === 'check') {
        const ks = args[0]; if (!ks) return msg.reply({ embeds: [error('Usage: `!ky check <key>`')] });
        const key = await keyService.getKeyByValue(ks, hub.id);
        if (!key) return msg.reply({ embeds: [error('Key not found.')] });
        msg.reply({ embeds: [new EmbedBuilder().setColor(key.status === 'ACTIVE' ? 0x14b8a6 : 0xef4444).setTitle('🔍 Key Info').addFields(
            { name: 'Key', value: `\`${key.keyString}\``, inline: false },
            { name: 'Status', value: key.status, inline: true }, { name: 'HWID', value: key.hwid || 'Unbound', inline: true },
            { name: 'Expires', value: key.expiresAt ? `<t:${Math.floor(key.expiresAt.getTime()/1000)}:R>` : 'Never', inline: true },
            { name: 'Executions', value: `${key.executions}`, inline: true }, { name: 'Note', value: key.note || '—', inline: true },
            { name: 'Discord', value: key.discordId ? `<@${key.discordId}>` : '—', inline: true },
            { name: 'IP', value: key.ipAddress || '—', inline: true }, { name: 'Created', value: `<t:${Math.floor(key.createdAt.getTime()/1000)}:R>`, inline: true }
        ).setTimestamp()] });
    }

    // ── reset ──
    else if (cmd === 'reset' || cmd === 'resethwid') {
        const ks = args[0]; if (!ks) return msg.reply({ embeds: [error('Usage: `!ky reset <key>`')] });
        const key = await keyService.getKeyByValue(ks, hub.id);
        if (!key) return msg.reply({ embeds: [error('Key not found.')] });
        await keyService.resetKeyHwid(key.id, hub.id);
        msg.reply({ embeds: [success(`HWID reset for \`${ks}\`.`)] });
    }

    // ── del ──
    else if (cmd === 'del' || cmd === 'delete') {
        const ks = args[0]; if (!ks) return msg.reply({ embeds: [error('Usage: `!ky del <key>`')] });
        const r = await keyService.deleteKeyByString(ks, hub.id);
        msg.reply({ embeds: [r ? success(`Deleted \`${ks}\`.`) : error('Key not found.')] });
    }

    // ── ban ──
    else if (cmd === 'ban') {
        const ks = args[0]; if (!ks) return msg.reply({ embeds: [error('Usage: `!ky ban <key>`')] });
        const key = await keyService.getKeyByValue(ks, hub.id);
        if (!key) return msg.reply({ embeds: [error('Key not found.')] });
        await keyService.updateKeyStatus(key.id, hub.id, 'BANNED');
        msg.reply({ embeds: [success(`Key \`${ks}\` **banned**.`)] });
    }

    // ── unban ──
    else if (cmd === 'unban') {
        const ks = args[0]; if (!ks) return msg.reply({ embeds: [error('Usage: `!ky unban <key>`')] });
        const key = await keyService.getKeyByValue(ks, hub.id);
        if (!key) return msg.reply({ embeds: [error('Key not found.')] });
        await keyService.updateKeyStatus(key.id, hub.id, 'ACTIVE');
        msg.reply({ embeds: [success(`Key \`${ks}\` **unbanned**.`)] });
    }

    // ── extend ──
    else if (cmd === 'extend') {
        const ks = args[0]; const hours = parseInt(args[1]);
        if (!ks || !hours) return msg.reply({ embeds: [error('Usage: `!ky extend <key> <hours>`')] });
        const key = await keyService.getKeyByValue(ks, hub.id);
        if (!key) return msg.reply({ embeds: [error('Key not found.')] });
        const r = await keyService.extendKeyExpiry(key.id, hub.id, hours * 3600);
        msg.reply({ embeds: [r ? success(`Extended \`${ks}\` by ${hours}h. New expiry: <t:${Math.floor(r.expiresAt.getTime()/1000)}:R>`) : error('Cannot extend lifetime keys.')] });
    }

    // ── whois ──
    else if (cmd === 'whois') {
        const target = args[0]; if (!target) return msg.reply({ embeds: [error('Usage: `!ky whois <hwid|ip|discord_id>`')] });
        const keys = await prisma.key.findMany({ where: { hubId: hub.id, OR: [{ hwid: target }, { ipAddress: target }, { discordId: target }] }, take: 10 });
        if (!keys.length) return msg.reply({ embeds: [error('No keys found for that identifier.')] });
        const desc = keys.map(k => `\`${k.keyString}\` — ${k.status} | HWID: ${k.hwid?.substring(0,12) || '—'}... | Execs: ${k.executions}`).join('\n');
        msg.reply({ embeds: [info(`🔎 Whois: ${target.substring(0,20)}`, desc)] });
    }

    // ── blacklist ──
    else if (cmd === 'blacklist' || cmd === 'bl') {
        const sub = args[0]; const target = args[1]; const reason = args.slice(2).join(' ');
        if (sub === 'add' && target) {
            await prisma.blacklist.create({ data: { hubId: hub.id, target, reason: reason || 'Discord ban' } });
            msg.reply({ embeds: [success(`Blacklisted \`${target}\`.`)] });
        } else if (sub === 'remove' && target) {
            const bl = await prisma.blacklist.findFirst({ where: { hubId: hub.id, target } });
            if (bl) { await prisma.blacklist.delete({ where: { id: bl.id } }); msg.reply({ embeds: [success(`Removed \`${target}\` from blacklist.`)] }); }
            else msg.reply({ embeds: [error('Not found in blacklist.')] });
        } else if (sub === 'list') {
            const bans = await prisma.blacklist.findMany({ where: { hubId: hub.id }, take: 20, orderBy: { createdAt: 'desc' } });
            const desc = bans.length ? bans.map(b => `\`${b.target}\` — ${b.reason}`).join('\n') : 'No blacklist entries.';
            msg.reply({ embeds: [info('🚫 Blacklist', desc)] });
        } else msg.reply({ embeds: [error('Usage: `!ky bl add|remove|list <target> [reason]`')] });
    }

    // ── stats ──
    else if (cmd === 'stats') {
        const s = await hubService.getHubStats(hub.id);
        msg.reply({ embeds: [new EmbedBuilder().setColor(0x14b8a6).setTitle(`📊 ${hub.name}`).addFields(
            { name: '🔑 Keys', value: `${s.keys}`, inline: true }, { name: '⚡ Executions', value: `${s.executions}`, inline: true },
            { name: '🟢 Online', value: `${s.online}`, inline: true }, { name: '📜 Scripts', value: `${s.scripts}`, inline: true },
            { name: '🚫 Blacklisted', value: `${s.blacklists}`, inline: true }
        ).setTimestamp()] });
    }

    // ── online ──
    else if (cmd === 'online') {
        const players = await prisma.playerSession.findMany({ where: { hubId: hub.id }, take: 25, orderBy: { lastPing: 'desc' } });
        const desc = players.length ? players.map(p => `**${p.playerName}** — ${p.executor} | ${p.gameName} | <t:${Math.floor(p.lastPing.getTime()/1000)}:R>`).join('\n') : 'No players online.';
        msg.reply({ embeds: [info(`🟢 Online Players (${players.length})`, desc)] });
    }

    // ── logs ──
    else if (cmd === 'logs') {
        const count = Math.min(parseInt(args[0]) || 10, 25);
        const logs = await prisma.executionLog.findMany({ where: { hubId: hub.id }, take: count, orderBy: { createdAt: 'desc' } });
        const desc = logs.length ? logs.map(l => `\`${l.keyString.substring(0,12)}...\` → **${l.scriptName}** | ${l.executor} | ${l.country} | <t:${Math.floor(l.createdAt.getTime()/1000)}:R>`).join('\n') : 'No logs.';
        msg.reply({ embeds: [info(`📋 Recent Logs (${logs.length})`, desc)] });
    }

    // ── scripts ──
    else if (cmd === 'scripts') {
        const scripts = await prisma.script.findMany({ where: { hubId: hub.id }, select: { scriptId: true, name: true, executions: true, isActive: true } });
        const desc = scripts.length ? scripts.map(s => `${s.isActive ? '🟢' : '🔴'} **${s.name}** (\`${s.scriptId}\`) — ${s.executions} execs`).join('\n') : 'No scripts.';
        msg.reply({ embeds: [info('📜 Scripts', desc)] });
    }

    // ── export ──
    else if (cmd === 'export') {
        const status = args[0]?.toUpperCase() || null;
        const keys = await keyService.getAllKeys(hub.id, { take: 500, status: ['ACTIVE','BANNED','EXPIRED'].includes(status) ? status : undefined });
        if (!keys.length) return msg.reply({ embeds: [error('No keys to export.')] });
        const csv = keys.map(k => `${k.keyString},${k.status},${k.hwid || ''},${k.expiresAt || 'lifetime'},${k.executions},${k.note}`).join('\n');
        const header = 'key,status,hwid,expires,executions,note\n';
        try { await msg.author.send({ content: `**${hub.name} — Key Export (${keys.length})**`, files: [{ attachment: Buffer.from(header + csv), name: `${hub.shortId}_keys.csv` }] }); msg.reply({ embeds: [success('Export sent to DMs.')] }); }
        catch { msg.reply({ embeds: [error('Could not DM you. Enable DMs.')] }); }
    }

    // ── purge ──
    else if (cmd === 'purge') {
        const type = args[0];
        if (type === 'expired') { const r = await keyService.deleteAllExpiredKeys(hub.id); msg.reply({ embeds: [success(`Purged ${r.count} expired keys.`)] }); }
        else if (type === 'banned') { const r = await keyService.deleteAllBannedKeys(hub.id); msg.reply({ embeds: [success(`Purged ${r.count} banned keys.`)] }); }
        else if (type === 'all') { const r = await keyService.deleteAllKeys(hub.id); msg.reply({ embeds: [success(`Purged ${r.count} keys.`)] }); }
        else msg.reply({ embeds: [error('Usage: `!ky purge <expired|banned|all>`')] });
    }

    // ── resetall ──
    else if (cmd === 'resetall') {
        const r = await keyService.resetAllHwids(hub.id);
        msg.reply({ embeds: [success(`Reset HWID on ${r.count} keys.`)] });
    }

    // ── pause / unpause ──
    else if (cmd === 'pause') { await hubService.updateHub(hub.id, { paused: true }); msg.reply({ embeds: [success('Hub **paused**.')] }); }
    else if (cmd === 'unpause' || cmd === 'resume') { await hubService.updateHub(hub.id, { paused: false }); msg.reply({ embeds: [success('Hub **resumed**.')] }); }

    // ── webhook ──
    else if (cmd === 'webhook') {
        const url = args[0];
        if (!url) return msg.reply({ embeds: [info('🔗 Webhook', hub.webhookUrl || 'Not set. Use `!ky webhook <url>`')] });
        await hubService.updateHub(hub.id, { webhookUrl: url === 'clear' ? '' : url });
        msg.reply({ embeds: [success(url === 'clear' ? 'Webhook cleared.' : 'Webhook updated.')] });
    }

    // ── regenapi ──
    else if (cmd === 'regenapi') {
        const updated = await hubService.regenerateApiKey(hub.id);
        try { await msg.author.send({ embeds: [new EmbedBuilder().setColor(0xf59e0b).setTitle('🔄 New API Key').setDescription(`\`${updated.apiKey}\``).addFields({ name: '⚠️ Warning', value: 'Update your Lua SDK with this new key.' }).setTimestamp()] }); msg.reply({ embeds: [success('New API key sent to DMs.')] }); }
        catch { msg.reply({ embeds: [error('Enable DMs to receive the key.')] }); }
    }

    // ── hub ──
    else if (cmd === 'hub') {
        const user = await prisma.user.findFirst({ where: { apiKey: srv.apiKey } });
        if (!user) return msg.reply({ embeds: [error('Account not found.')] });
        const hubs = await prisma.hub.findMany({ where: { ownerId: user.id } });
        const target = args[0];
        if (target) {
            const h = hubs.find(h => h.shortId === target);
            if (!h) return msg.reply({ embeds: [error('Hub not found.')] });
            await prisma.discordServer.update({ where: { guildId: gid }, data: { activeHubId: h.shortId } });
            return msg.reply({ embeds: [success(`Switched to **${h.name}** (\`${h.shortId}\`)`)] });
        }
        const desc = hubs.map(h => `${h.shortId === hub.shortId ? '▸' : '  '} **${h.name}** — \`${h.shortId}\` ${h.paused ? '⏸️' : '🟢'}`).join('\n');
        msg.reply({ embeds: [new EmbedBuilder().setColor(0x14b8a6).setTitle('📡 Your Hubs').setDescription(desc).setFooter({ text: '!ky hub <id> to switch' })] });
    }

    // ── security ──
    else if (cmd === 'security') {
        const events = await prisma.securityEvent.findMany({ where: { severity: { in: ['CRITICAL', 'HIGH'] } }, take: 10, orderBy: { createdAt: 'desc' } });
        const desc = events.length ? events.map(e => `**${e.severity}** — ${e.detectionType} | IP: \`${e.ipAddress}\` | <t:${Math.floor(e.createdAt.getTime()/1000)}:R>`).join('\n') : 'No recent threats.';
        msg.reply({ embeds: [info('🛡️ Security Events', desc)] });
    }

    // ── help ──
    else if (cmd === 'help') {
        msg.reply({ embeds: [new EmbedBuilder().setColor(0x14b8a6).setTitle('Kymor Bot Commands').setDescription([
            '**Setup**', '`setup <api_key>` — Link account', '`setrole <manager|buyer> <@role>` — Set roles', '`hub [id]` — List/switch hubs',
            '', '**Keys**', '`gen [amount] [hours] [note]` — Generate keys', '`check <key>` — Key info', '`reset <key>` — Reset HWID', '`extend <key> <hours>` — Extend expiry',
            '`del <key>` — Delete key', '`ban <key>` — Ban key', '`unban <key>` — Unban key', '`whois <hwid|ip|discord>` — Find keys',
            '`export [status]` — Export CSV', '`purge <expired|banned|all>` — Bulk delete', '`resetall` — Reset all HWIDs',
            '', '**Hub**', '`stats` — Hub statistics', '`online` — Online players', '`logs [count]` — Execution logs', '`scripts` — Script list',
            '`pause` / `resume` — Toggle hub', '`webhook <url|clear>` — Set webhook', '`regenapi` — Regenerate API key',
            '', '**Security**', '`bl add|remove|list <target>` — Blacklist', '`security` — Recent threats',
        ].join('\n')).setFooter({ text: `Prefix: ${PREFIX} | Active Hub: ${hub.name}` })] });
    }
});

export default {
    start: () => { if (process.env.DISCORD_TOKEN) client.login(process.env.DISCORD_TOKEN).catch(e => console.error('Bot login failed:', e.message)); },
    client
};