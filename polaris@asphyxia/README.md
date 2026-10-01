Polaris Chord
============

Asphyxia plugin for XIF (Polaris Chord), ported from
`polaris-servers/medusapluginpolarischord` (C# / Medusa) plus the matching
and unlock behavior of `polaris-servers/MonkeyBusiness/modules/polaris`
(Python). Structure mirrors `mfg@asphyxia` (both games are Unity XRPC titles).

Game code: `XIF`.

Tested version: `XIF:J:A:A:2025070800` (client build 2025-07-08 — the default
model in MonkeyBusiness `pyeamu.py`, and the newest event data in its unlock
catalogs reaches June 2025). Like both reference servers (Medusa sets
MinVer/MaxVer = null; MonkeyBusiness whitelists models LAV/XIF with no
datecode check), this plugin does not gate by version: older and newer
clients should work as long as Konami keeps the XRPC schema compatible,
with the echo persistence (`usr.save`/`usr.get`) tolerating new fields
automatically.

Endpoints (13 XIF + 10 matching + standard eamuse infra)
--------------------------------------------------------
- usr.checkin / usr.checkout -> status 0 (multi-cab guard TODO, like C#)
- usr.get -> result 1 (no profile) / 2 (no usr_name yet) / 0 + echo data,
  plus full song unlock list and tutorial-flag coherence (MonkeyBusiness)
- usr.sign_up -> creates profile shell, returns usr_id + crew_id (idempotent)
- usr.save -> stores request body verbatim (echo) with monotonic play-count
  merge (MAX) and game_play_count -> mode-counter mapping (MonkeyBusiness),
  returns status 0
- usr.save_musicscore -> appends play logs, status 145 on empty/missing
- usr.get_usr_music -> aggregates stored logs per (music_id, difficulty),
  same max/count semantics as C# GetUsrMusicHandler
- mst.get_common -> song catalog from data/musics.json, or full known
  catalog (1-400 + 99900/99901, all Open) when no seeds; matching events
  with asset_id params (MonkeyBusiness)
- gacha.begin_gacha / draw_gacha / end_gacha -> in-memory transactions with
  rarity-weighted draws (R/SR/SSR + pickup weight, like C# GachaService);
  end_gacha grants items into the echo profile and returns player_data
- gacha.get_gacha_info -> catalog from data/gacha.json
- pcb.save / pcb.save_error_log -> status 0 + now_date
- Online matching (MonkeyBusiness pcb.py + usr temp cards):
  pcb.sync_matching_room (+ matching_room alias),
  pcb.sync_matching_music (+ matching_music alias),
  pcb.sync_matching_progress, pcb.sync_matching_game_result,
  pcb.finish_matching_room, usr.get_temp / usr.save_temp
- Standard: pcbtracker, message, facility, package, pcbevent, eventlog,
  cardmng (+ xifcard shadow, compat/strict via XIF_CARDMNG_MODE), eacoin,
  generic posevent/pkglist/userdata/userid/sidmgr/netlog/local stubs

Persistence
-----------
Echo raw: `usr.save` stores the whole XRPC body in the `profile` collection
(keyed by refid, ProfileSpace). `usr.get` / `end_gacha.player_data` return it
back plus ids. Unknown future fields survive version updates automatically.
Music logs are kept separately in the same doc (`scores`) for get_usr_music.
Cards live inside the profile doc (same trick as mfg@asphyxia).

Static data
-----------
The C# plugin reads the game's own Unity bundles
(`StreamingAssets/aa/StandaloneWindows64/database_assets_database/*.bytes.bundle`).
The JSON seeds here are built from those same bundles (see
`polaris-servers` notes + `opencode/*.py` extract scripts):

- data/musics.json (323 songs, all Open) from Music/ChartDataMaster.
- data/gacha.json (109 events + real card pools) from GachaEventMaster +
  CharacterCardMaster (Contenter/Snapshot/Fukubiki pools, R/SR/SSR).
- data/events.json (936 always-open events) from shop/ticket/promotion/
  caravan/login-bonus/advertisement/season/matching masters.
- data/demo.json (11 attract previews) from DemoMovieMaster MusicPreview.
- data/shop_goods.json: Continue-lottery goods events 1+2 (server-rolled
  in usr.save; edit weights/stock freely).

Not yet ported (C# has it, echo covers behavior but not the tables)
--------------------------------------------------------------------
- Full EF entity graph (ProfileDecks, CharacterCards, LoginBonus, shop,
  caravan, promotions, feature-flag DB) — echo preserves the bytes without
  the relational tables. Login bonus stamps, decks/cards/characters and
  gacha ticket/item balances all round-trip through echo + changelogs.
- Gacha ticket/item balance enforcement (free draws, like mfg economy TODO).

Config
------
- XIF_VERBOSE (boolean, default false): per-request debug logs.
  Login/save one-liners (`usr.get/save/sign_up`) always print.
- XIF_CARDMNG_MODE (compat|strict, default compat): malformed cardid handling.
- XIF_UNLOCK_SONGS (boolean, default true): full song unlock list in
  usr.get. Disable for a locked roster.
- Matching lobbies are in-memory (rooms 15 min TTL, temp cards 20 min):
  they die on core restart, like tables/lobbies in mfg@asphyxia.
- No UDP peer relay: MonkeyBusiness relays P2P gameplay packets between
  NATs (peer_relay.py); an Asphyxia plugin cannot open UDP sockets, so
  matched cabs must reach each other directly (same LAN/VPN or port
  forward). The XRPC lobby itself works anywhere.

WebUI pages (auto-mounted from webui/)
--------------------------------------
- players: profile list (name, rank, EXP, plays, crew/usr ids).
- profile_scores (per profile): info + best score per chart.
- rankings: best score per chart across all profiles.

Not yet ported
--------------
- Notices / official roles / presents (always empty, like C#).
