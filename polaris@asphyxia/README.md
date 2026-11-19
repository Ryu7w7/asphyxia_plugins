Polaris Chord
============

Supported versions:

- `XIF:J:A:A:2025070800`
- `XIF:J:A:A:2026012100`

The build is read from the model string of every request, so cabinets on
different builds can share one server.

Game data per build
-------------------

Songs, gacha events, open events and attract demos come from each build's own
master tables, so every build has its own seeds:

| Folder | Contents |
|---|---|
| `data/*.json` | 2025070800 seeds (also the fallback for anything not overridden) |
| `data/2025070800/` | `mst_patch.csv` |
| `data/2026012100/` | `musics.json`, `gacha.json`, `events.json`, `demo.json`, `shop_goods.json`, `mst_patch.csv` |

A request uses the newest `data/<build>/` folder that is not newer than its own
build, so a brand new release boots with the latest seeds until its own are
generated. To add a build (needs `pip install UnityPy`):

```
python tools/xif_data.py dump  <game>/contents  masters
python tools/xif_data.py build masters data/<build>
```

`build` reproduces the 2025070800 seeds exactly from that build's masters and
carries over the events opened in `data/events.json`, adding whatever the new
masters reference.

`mst_patch.csv` re-sends the two `CharacterCardMaster` rows that ship with a
placeholder `Version` of 9999999 (`00080001`, `00080004`). The client deletes
rows above its asset version right after applying the patch, so without it
those cards vanish and drawing them fails with gacha error 301.

2026012100 additions
--------------------

- `usr.draw_goods_gacha`: the Continue-scene goods campaign (event 3). Wins are
  stored per player and served as `usr_shop_goods_history`; the campaign is not
  offered again until the prize expires (`expire_days`, default 30). Set
  `lose_weight` on the event in `shop_goods.json` to make draws lose sometimes.
  Lottery events 1 and 2 ship with stock 0 for this build because the client
  checks them first and would never show event 3 otherwise.
- `usr.save` also returns `mst_shop_goods_event`; `mst.get_common` sends an
  empty `mst_music_stats`; scores keep `played_at`.
- New save fields (`usr_music_favos`, new options and play info fields) are
  stored and returned like every other field.
