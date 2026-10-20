# Opponent portraits

The computer's portrait changes with its strength: a boy at Beginner, a teenager at Easy, a young
man at Medium, a man in his forties at Hard, a white-bearded wizard at Expert and a robot at Maximum
Strength.

The portraits come from the illustrated level cards in `sources/`, supplied by the project author
for Grandmaster 3D. `npm run portraits` (scripts/build-portraits.mjs) crops each card's picture to
head and shoulders and writes it to `public/portraits/`.

| Level | Source card |
| --- | --- |
| Beginner | `cards-beginner-to-hard.png`, first card |
| Easy | `cards-beginner-to-hard.png`, second card |
| Medium | `cards-beginner-to-hard.png`, third card |
| Hard | `cards-beginner-to-hard.png`, fourth card |
| Expert | `card-expert.png` |
| Maximum Strength | `card-maximum.png` |
