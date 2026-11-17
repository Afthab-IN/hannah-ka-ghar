# Credits

Every asset below is public domain or CC0. None of them requires attribution; the credits are listed as a courtesy and as a provenance record.

## 3D models (`public/models/`)

All four are by Quaternius, downloaded from poly.pizza. Each model page shows "Public Domain (CC0)" with a link to https://creativecommons.org/publicdomain/zero/1.0/, and the page data gives the licence as "CC0 1.0". The files are the original `.glb` exports, unmodified: only the file names were changed.

| Local file | Title | Author | Source page | Licence | Changes |
|---|---|---|---|---|---|
| horse_brown.glb | Horse (Animated Animal Pack) | Quaternius | https://poly.pizza/m/qvTrSG9pZF | CC0 1.0 (Public Domain) | none, renamed from d37dbc87-ca61-4b2c-a2da-d2f0c4240bef.glb |
| horse_white.glb | White Horse (Animated Animal Pack) | Quaternius | https://poly.pizza/m/bEdE4rmZy9 | CC0 1.0 (Public Domain) | none, renamed from 3edc2bd9-3378-4b43-a50d-d5e1f858562b.glb |
| cat.glb | Cat | Quaternius | https://poly.pizza/m/qKICY6xla2 | CC0 1.0 (Public Domain) | none, renamed from 67f5e3fe-37ee-4c86-95c8-d269d8c9f8ba.glb |
| chicken.glb | Chicken | Quaternius | https://poly.pizza/m/Z3RCoCYss4 | CC0 1.0 (Public Domain) | none, renamed from 9ba093a4-6525-4f3b-927d-98dca72e1e40.glb |

Bundle pages: https://poly.pizza/bundle/Animated-Animal-Pack-ILAPXeUYiS (both horses).

## Sounds (`public/audio/`)

Common processing for every clip (ffmpeg): cut to the stated range, filter as stated, resample to 44.1 kHz, measure EBU R128 loudness and apply a linear gain toward the target (about -20 LUFS for loops, about -16 LUFS for one-shots), limited so true peak stays near -1 dBFS, then encode MP3 128 kbps CBR (with the LAME/Info gapless header). Peak-heavy one-shots (footsteps, door, bell, creak) end up below -16 LUFS because their peaks reach -1 dBFS first.

- **Loops** were made seamless by crossfading the tail of the cut into its head (equal-power, length given below), so the last sample flows into the first.
- **One-shots** had leading and trailing silence trimmed, a 0.5 ms fade-in and a short fade-out added, and were mixed down to mono.

| Local file | Title | Author | Source page | Licence | Changes |
|---|---|---|---|---|---|
| birds_day.mp3 | Birdsong mild sunny day (PDSounds #104) | stephan | https://commons.wikimedia.org/wiki/File:Birdsong_mild_sunny_day.ogg | Public domain (PD-author, PD-pdsounds.org) | 0.5 to 35.5 s, high-pass 150 Hz, +5.7 dB, 3 s crossfade, 32 s stereo loop |
| wind_meadow.mp3 | Soundscape - Lower Geyser Basin (Strong Wind), file yell-040201LowerGeyserBasinWindInTreesBinaural01011.mp3 | National Park Service / Peter Comley | https://www.nps.gov/yell/learn/photosmultimedia/sounds-soundscapes.htm (library terms: https://www.nps.gov/yell/learn/photosmultimedia/soundlibrary.htm) | Public domain (Yellowstone sound library: "in the public domain", credit "National Park Service" where appropriate) | 2 to 46 s (the calmer start of a 5 min recording), high-pass 70 Hz, +12.7 dB, 4 s crossfade, 40 s stereo loop |
| crickets_night.mp3 | Country Night Noise (PDSounds #561) | hc | https://commons.wikimedia.org/wiki/File:Country_night_noise.ogg | Public domain (PD-author, PD-pdsounds.org) | 7.4 to 29.9 s (skips a loud event at 4 to 7 s and a click at 31 s), high-pass 300 Hz, +18.5 dB with up to 4 dB peak limiting, 2.5 s crossfade, 20 s mono loop |
| fire_crackle.mp3 | Fireplace Sound loop (fire.wav) | PagDev | https://opengameart.org/content/fireplace-sound-loop | CC0 | 0.5 to 28.5 s, high-pass 60 Hz, +20.2 dB with up to 6 dB peak limiting on crackles, 3 s crossfade, 25 s stereo loop |
| water_lap.mp3 | 363120 fractalstudios water-trickle.wav ("A small burn trickling through a wooded area") | FractalStudios (Freesound #363120) | https://commons.wikimedia.org/wiki/File:363120_fractalstudios_water-trickle.wav | CC0 (cc-zero) | 0.5 to 31.5 s, high-pass 100 Hz, +18.2 dB with up to 6 dB peak limiting, 3 s crossfade, 28 s stereo loop. A gentle trickle, not lapping waves |
| cat_purr.mp3 | Purring cat | Mysid | https://commons.wikimedia.org/wiki/File:Purring_cat.oga | Public domain (PD-self) | 0 to 9.5 s, mono, +5.7 dB, 1.5 s crossfade, 8 s loop |
| chickens.mp3 | Chickens demanding food (PDSounds #538) | alys | https://commons.wikimedia.org/wiki/File:Chickens_demanding_food.ogg | Public domain (PD-author, PD-pdsounds.org) | 0.2 to 10.7 s, +3.1 dB, 1.5 s crossfade, 9 s mono loop |
| cat_meow.mp3 | Cat Purr & Meow (cat_softmew.wav) | Kerzoven | https://opengameart.org/content/cat-purr-meow | CC0 | silence trimmed, +3.4 dB |
| duck_quack.mp3 | Ducks snatching | Bert76 | https://commons.wikimedia.org/wiki/File:Ducks_snatching.ogg | CC0 (self, cc-zero) | first 1.05 s (three quacks), mono, +7.9 dB, 80 ms fade-out |
| door_open.mp3 | RPG Audio: doorOpen_2.ogg | Kenney (kenney.nl) | https://kenney.nl/assets/rpg-audio | CC0 (Creative Commons Zero) | mono, trimmed, +1.7 dB |
| door_close.mp3 | RPG Audio: doorClose_4.ogg | Kenney (kenney.nl) | https://kenney.nl/assets/rpg-audio | CC0 (Creative Commons Zero) | mono, trimmed, +2.3 dB |
| step_grass_1.mp3 | Impact Sounds: footstep_grass_000.ogg | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 (Creative Commons Zero) | mono, trimmed, +3.1 dB |
| step_grass_2.mp3 | Impact Sounds: footstep_grass_002.ogg | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 (Creative Commons Zero) | mono, trimmed, +3.1 dB |
| step_grass_3.mp3 | Impact Sounds: footstep_grass_004.ogg | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 (Creative Commons Zero) | mono, trimmed, +3.1 dB |
| step_wood_1.mp3 | Impact Sounds: footstep_wood_000.ogg | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 (Creative Commons Zero) | mono, trimmed, +2.9 dB |
| step_wood_2.mp3 | Impact Sounds: footstep_wood_001.ogg | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 (Creative Commons Zero) | mono, trimmed, +3.0 dB |
| step_wood_3.mp3 | Impact Sounds: footstep_wood_002.ogg | Kenney (kenney.nl) | https://kenney.nl/assets/impact-sounds | CC0 (Creative Commons Zero) | mono, trimmed, +2.9 dB |
| swing_creak.mp3 | Tree Creaking (tree_creak.flac; recording credited to Department64 on the page) | AntumDeluge | https://opengameart.org/content/tree-creaking | CC0 | first 2.3 s, +10.4 dB, 150 ms fade-out |
| shop_bell.mp3 | Soothing jingling little bells ambience (PDSounds #423, a little baby bell-rattle toy) | stephan | https://commons.wikimedia.org/wiki/File:Soothing_jingling_little_bells_ambience.ogg | Public domain (PD-author, PD-pdsounds.org) | 15.8 to 17.6 s excerpt (one jingle), trimmed, 400 ms fade-out |
| owl.mp3 | Barred Owl, Yellowstone National Park | National Park Service | https://commons.wikimedia.org/wiki/File:Barred_Owl,_Yellowstone_National_Park.oga | Public domain (PD-USGov-NPS) | trimmed, -0.4 dB, 200 ms fade-out |
| horse_neigh.mp3 | Wiehern | Hü | https://commons.wikimedia.org/wiki/File:Wiehern.ogg | Public domain (PD-self) | high-pass 120 Hz, trimmed, +10 dB, 150 ms fade-out. The source is band-limited (nothing above about 3.5 kHz) |

## Textures (Poly Haven, CC0)

All from https://polyhaven.com (public domain, CC0). Downloaded as 1k JPGs; composed or resized into `public/tex/`.

| Local file | Source asset | What changed |
|---|---|---|
| tex/leaves.png, tex/leaves_1k.png | island_tree_02 (leaves_diff, leaves_alpha) https://polyhaven.com/a/island_tree_02 | Eight leaf sprites cut out and arranged along drawn twigs into a leaf-cluster card, with edge colour bleed |
| tex/grass_clumps.png | grass_medium_01 (Diffuse, Alpha) https://polyhaven.com/a/grass_medium_01 | Four grass clumps cut out into a 4-cell card atlas |
| tex/flower_heads.png | celandine_01 https://polyhaven.com/a/celandine_01 and dandelion_01 https://polyhaven.com/a/dandelion_01 (Diffuse, Alpha) | Two flower heads from each, cut out |
| tex/bark.jpg, tex/bark_n.jpg | bark_brown_02 https://polyhaven.com/a/bark_brown_02 | Resized (normal map to 512) |
| tex/ground_grass.jpg | aerial_grass_rock https://polyhaven.com/a/aerial_grass_rock | Used as detail on the grass ground |
| tex/path.jpg, tex/path_n.jpg | dirt_floor https://polyhaven.com/a/dirt_floor | Path colour and bumps |
| tex/soil.jpg | farm_soil https://polyhaven.com/a/farm_soil | Garden beds |

tree_small_02 leaves were downloaded but not used.

## Building textures and furniture (Poly Haven, CC0)

Textures (1k, resized into `public/tex/`): white_planks_clean (siding, beadboard), red_brick_03 (brick), box_profile_metal_sheet (roof metal, repainted), wood_floor (floors), wood_floor_deck (downloaded, not used), painted_plaster_wall (plaster), long_white_tiles (wall tiles), weathered_plank_siding (barn boards). All from https://polyhaven.com/textures, CC0.

Furniture (glTF, 1k textures resized to 512 or 1k, in `public/models/furniture/`): Sofa_01, ArmChair_01, Rockingchair_01, CoffeeTable_01, dining_table, dining_chair_02, old_bed_frame, ClassicNightstand_01, painted_wooden_nightstand, wooden_bookshelf_worn, painted_wooden_cabinet. All from https://polyhaven.com/models, CC0. dining_chair_02, old_bed_frame, Rockingchair_01, CoffeeTable_01 and wooden_bookshelf_worn were simplified with meshoptimizer (`_tools/simplify.mjs`, not in the repo) to save triangles.
