# Opponent portraits

The computer's portrait changes with its strength. Five are old-master paintings in the public
domain; the sixth is an original render. `npm run portraits` crops and treats them all the same way
(scripts/build-portraits.mjs) into `public/portraits/`.

| Level | Sitter | Work | Source and licence |
| --- | --- | --- | --- |
| Beginner | A young boy | Léopold Robert, *Portrait of a Child*, 1831 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Portrait_of_a_Child_by_L%C3%A9opold_Robert,_1831.jpg), public domain |
| Easy | A teenage boy | Michiel Sweerts, *Portrait of a Youth*, about 1655–1661, Legion of Honor, San Francisco | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Portrait_of_a_Youth_by_Michael_Sweerts,_California_Palace_of_the_Legion_of_Honor.JPG), public domain |
| Medium | A young man | Pauline Auzou, *Portrait of a Young Man*, 1809 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Pauline_Auzou_-_Portrait_of_a_young_man,_1809.jpg), public domain |
| Hard | A bearded man in a ruff | Paulus Moreelse, *Portrait of a Middle-Aged Man*, 1630 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Paulus_Moreelse_-_Portrait_of_a_Middle-Aged_Man_-_Google_Art_Project.jpg), public domain |
| Expert | An old man with a long white beard | Anthony van Dyck, *Study Head of an Old Man with a White Beard*, about 1617–20, The Metropolitan Museum of Art | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Study_Head_of_an_Old_Man_with_a_White_Beard_MET_DT251482.jpg), CC0 |
| Maximum Strength | A brass automaton | Original render, `blender/scripts/robot_portrait.py` | Part of this project, GPL-3.0-or-later |

To rebuild the automaton: `blender --background --python blender/scripts/robot_portrait.py --
art/portraits/sources/maximum.png`, then `npm run portraits`.
