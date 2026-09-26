# Extended Vocabulary Catalog (draft 1)

**Status:** Draft word list for phase 010 slice 1
(`docs/phases/010_Extended_Picture_Library.md`). Words first, metadata later.
Not perfect on purpose: the demand counter (slice 6) corrects it.

**DECIDED 2026-09-24** (founder): brand foods, drinks, stores and toys get
drawn pictures. Characters, shows, games, apps and songs get words and audio
only, no drawn picture. Families use Draw it for me for those, which also
tells us what Muse will draw. Holidays and occasions are their own groups.

> [!IMPORTANT]
> **Check for an existing picture before generating one.** About 1,930 rows
> already have an unreviewed drawing in `out/extended_art/<id>.png`. The
> `<id>` is the label in lowercase with every run of other characters turned into
> `_` (`Goldfish (crackers)` → `goldfish_crackers.png`). The founder
> estimates about 75% are usable.
>
> For any extended word:
>
> 1. Look for `out/extended_art/<id>.png`. If it exists, review it first. Its
>    prompt and settings are in `out/extended_art/results.jsonl`.
> 2. Generate only if there is no file or the review rejects it. Generate one
>    image at a time, ten at most, with the founder (`AGENTS.md` § Project Laws).
> 3. Record every review decision in `out/extended_art/review.json`
>    (`approve`, `reroll` or `reject`). `node scripts/art/review_server.mjs`
>    shows the unreviewed ones 50 at a time. It calls no paid API.
>
> `out/` is gitignored, so these files exist only on the founder's machine. Do
> not delete them. 1,472 rows were never drawn. 19 were blocked by Meta's content
> filter (mostly toileting and underwear words); `results.jsonl` lists them.

How to read this file:

- Each `##` section is one category. Its `art:` line says whether we draw it.
  `art: draw` means generate a picture. `art: none` means words and audio only.
- Items are comma-separated. A parenthesis marks the sense when a label could
  mean two things, for example `Chase (Paw Patrol)`. The parenthesis is not
  spoken.
- No item repeats a launch word (`data/launch_lexicon.json`).
- Selection: everyday words come from the age-of-acquisition pool
  (`data/reference/aoa.csv`), sorted by age and curated by category. The
  child's-world sections (brands, characters, media, holidays, sounds) come
  from what children actually say. CHILDES child speech was the check.

---

## Actions

art: draw

clap, wave, blow, splash, spill, dig, sweep, mop, dust, whisper, yell, scream,
shout, sneeze, yawn, burp, hiccup, sniff, smell, taste, lick, chew, swallow,
sip, pour, stir, mix, bake, fry, spread, peel, squeeze, shake, bounce, roll,
spin, twirl, hop, skip, march, tiptoe, stomp, gallop, skate, ski, sled, surf,
dive, float, paddle, go fishing, hike, race, chase, hide, peek, knock, zip,
unzip, unbutton, tie, untie, buckle, unbuckle, brush, floss, rinse, spit,
flush, bathe, shave, fold, hang, stack, sort, match, pack, unpack, wrap,
unwrap, fill, dump, pick, pick up, lift, reach, grab, pinch, poke, pat, rub,
squish, smash, crash, bump, trip, slip, drip, melt, freeze, grow, feed, visit,
meet, call, watch, hear, learn, teach, practice, try, win, lose, cheat, trade,
borrow, buy, pay, sell, shop, save, spend, drive, fly, sail, row, measure,
staple, erase, trace, spell, type, click, swipe, tap, scroll, charge, turn on,
turn off, plug in, pretend, imagine, dream, wish, hope, pray, celebrate,
decorate, dress up, wrestle, cuddle, snuggle, rock, punch, shove, fight,
argue, tease, tidy, sew, hum, whistle, stretch, exercise, balance, flip,
somersault, cartwheel, handstand, leap, knock down, bleed, rest, relax,
breathe, hurry, rush, start, finish, begin, end, quit, keep, leave, stay,
arrive, move, follow, lead, line up, stand up, sit down, lie down, get up,
turn around, look for, point, nod, shrug, wink, blink, smile, frown, pout,
giggle, whine, sigh, throw up, scoop, sprinkle, dip, cut out, sharpen,
mess up, tear, rip, kiss goodnight, tuck in, wake, snore, nap, jog,
blow bubbles, blow out, pop, undress

## Describing words

art: draw

yummy, yucky, delicious, sour, sweet, salty, spicy, bitter, crunchy, chewy,
juicy, mushy, creamy, crispy, smelly, stinky, fuzzy, fluffy, furry, bumpy,
squishy, slimy, slippery, shiny, sparkly, glittery, colorful, striped,
spotted, round, pointy, sharp, flat, curly, straight, hairy, bald, tiny,
small, medium, large, strong, weak, brave, kind, mean, nice, rude, polite,
cute, beautiful, ugly, scary, spooky, creepy, magic, itchy, sore, sweaty,
grumpy, cranky, jealous, embarrassed, worried, confused, curious,
disappointed, annoyed, upset, loved, lucky, relaxed, hyper, wiggly, freezing,
boiling, chilly, cozy, fresh, rotten, stale, ripe, raw, cooked, burnt, melted,
frozen, loose, tight, closed, locked, busy, free, done, finished, late, early,
dim, sunny, cloudy, rainy, windy, snowy, foggy, stormy, muddy, sandy, messy,
neat, missing, lost, found, alive, dead, real, fake, true, false, best, worst,
better, worse, less, most, least, enough, half, whole, double, opposite, fair,
unfair, boring, fun, awesome, amazing, crazy, naughty, perfect, important,
private, silver, gray, clear, deep, shallow, high, low, near, far, huge,
teeny, stuffy, shaky, grouchy, gentle, strict, friendly, famous, rich, poor,
young, cheerful

## Home and things

art: draw

bathtub, toilet paper, trash can, recycling, laundry, washing machine, dryer,
dishwasher, oven, stove, toaster, blender, pot, pan, mug, lid, jar, container,
lunchbox, water bottle, sippy cup, high chair, crib, bunk bed, nightlight,
closet, drawer, shelf, bookshelf, dresser, curtain, blinds, light switch,
doorbell, doorknob, lock, gate, fence, mailbox, mail, package, letter, remote,
video game, controller, speaker, laptop, keyboard, printer, wifi, light bulb,
candle, picture, photo, calendar, alarm clock, money, coin, dollar,
piggy bank, purse, lotion, sunscreen, bug spray, shampoo, bubble bath,
bath toy, washcloth, cotton swab, nail clippers, hair dryer, hairbrush,
hair tie, deodorant, makeup, lipstick, nail polish, scissors, stapler,
pencil sharpener, glue stick, eraser, ruler, notebook, folder, envelope,
sticker, stamp, string, rope, chain, ribbon, balloon, present, wrapping paper,
basket, shovel, rake, hose, sprinkler, lawn mower, ladder, hammer, nail,
screwdriver, wrench, drill, saw, toolbox, heater, air conditioner, ice pack,
heating pad, weighted blanket, sleeping bag, tent, lovey, pacifier, bib,
car seat, booster seat, seatbelt, dustpan, spray bottle, placemat, chopsticks,
measuring cup, whisk, spatula, rolling pin, cookie cutter, oven mitt,
cutting board, lunch bag, cooler, grill, trampoline, pool noodle, bench,
stool, step stool, rocking chair, bean bag, cushion, quilt, sheet, pillowcase,
mattress, hanger, laundry basket, iron, sewing machine, needle, thread,
smoke alarm, fire extinguisher, first aid kit, vase, plant pot, watering can,
bird feeder, doormat, welcome mat, coat rack, tape measure, magnifying glass,
binoculars, telescope, globe, map, flag, trophy, medal, sticker chart, timer,
visual schedule, fidget, noise cancelling headphones, earplugs, wheelchair,
walker, crutches, cane, communication device, stairs gate, baby monitor

## Food

art: draw

avocado, blueberry, raspberry, blackberry, cherry, peach, pear, plum, mango,
pineapple, kiwi, lemon, lime, coconut, cantaloupe, melon, clementine, raisins,
applesauce, fruit cup, tomato, potato, sweet potato, mashed potatoes,
french toast, hash browns, tater tots, onion, pepper, cucumber, pickle,
lettuce, salad, spinach, celery, peas, green beans, beans, cauliflower,
zucchini, mushroom, olive, bacon, sausage, ham, turkey, steak, meatball,
meatloaf, shrimp, salmon, tuna, fish sticks, chicken wings, drumstick,
ribs (food), taco, burrito, quesadilla, nachos, salsa, guacamole, enchilada,
tortilla, spaghetti, noodles, ramen, lasagna, ravioli, mac and cheese,
grilled cheese, peanut butter, peanut butter and jelly, jelly, honey,
cream cheese, sour cream, ranch, mustard, mayo, barbecue sauce, hot sauce,
gravy, salt, sugar, dumplings, sushi, fried rice, egg roll, curry, hummus,
pita, cornbread, biscuit, dinner roll, croissant, bun, string cheese,
granola bar, granola, trail mix, nuts, peanuts, almonds, sunflower seeds,
rice cake, pudding, jello, brownie, cupcake, pie, cinnamon roll, marshmallow,
chocolate, lollipop, gum, gummy bears, jelly beans, cotton candy, caramel,
sprinkles, whipped cream, frosting, milkshake, hot chocolate, lemonade, soda,
orange juice, grape juice, coffee, sparkling water, ice, ice cube, slushie,
snow cone, sundae, ice cream cone, baby food, formula, puffs, chili, corn dog,
cheeseburger, fried chicken, chicken tenders, dessert, leftovers, lunch meat,
bologna, hot pocket, pot roast, pork chop, lamb chop, tofu, lentils,
chickpeas, black beans, refried beans, rice and beans, fajitas, empanada,
tamale, pupusa, arepa, plantains, pierogi, matzo ball soup, challah, naan,
roti, dal, samosa, biryani, pho, spring roll, teriyaki, orange chicken,
lo mein, bao, kimchi, bibimbap, jerk chicken, gyro, kebab, pasta salad,
potato salad, coleslaw, deviled eggs, scrambled eggs, fried egg, boiled egg,
omelet, cereal bar, protein bar, protein shake, acai bowl, yogurt tube,
cottage cheese, cheese slice, veggie sticks, baby carrots, snap peas, edamame,
corn on the cob, baked potato, onion rings, mozzarella sticks, garlic bread,
breadsticks, soft pretzel, pizza slice, pepperoni, sub sandwich, wrap (food),
pigs in a blanket, chicken noodle soup, tomato soup, broth, oatmeal cookie,
sugar cookie, chocolate chip cookie, banana bread, pumpkin bread, apple pie,
cherry pie, cheesecake, birthday cake, cake pop, cookie dough, frozen yogurt,
sherbet, italian ice, fudge, candy bar, peppermint, licorice, gumdrops,
jawbreaker, applesauce pouch, warm milk, soy milk, oat milk, almond milk,
coconut water, iced tea, sweet tea, root beer float, strawberry milk, eggnog,
apple cider

## Animals

art: draw

alligator, crocodile, ant, bee, beetle, ladybug, caterpillar, worm, snail,
fly (bug), mosquito, grasshopper, cricket, dragonfly, firefly, moth, bat, owl,
eagle, parrot, flamingo, peacock, swan, goose, rooster, chick, crow, seagull,
pigeon, woodpecker, ostrich, hummingbird, cardinal, blue jay, robin, kangaroo,
koala, panda, polar bear, gorilla, sloth, fox, wolf, deer, moose, raccoon,
skunk, squirrel, chipmunk, rabbit, hamster, guinea pig, mouse, rat, hedgehog,
porcupine, beaver, otter, seal, walrus, octopus, jellyfish, starfish, crab,
lobster, shark, seahorse, stingray, clownfish, goldfish, narwhal, camel,
llama, donkey, lamb, pony, unicorn, dragon, T. rex, triceratops, stegosaurus,
velociraptor, pterodactyl, brontosaurus, lizard, chameleon, tortoise, toad,
tadpole, cheetah, leopard, rhino, buffalo, orca, sea turtle, puffin,
bald eagle, hawk, vulture, bluebird, duckling, piglet, calf, foal, cub, fawn,
ram, mule, yak, anteater, armadillo, opossum, badger, mole, meerkat, lemur,
orangutan, chimpanzee, baboon, jaguar, panther, hyena, warthog, wildebeest,
gazelle, platypus, manatee, sea lion, swordfish, pufferfish, eel, squid, clam,
oyster, scorpion, centipede, praying mantis, stick bug, termite, wasp, hornet,
tick, lice, pet fish, cockatoo, parakeet, canary, iguana, gecko, rattlesnake,
cobra, python, bullfrog, salamander, axolotl, woolly mammoth,
saber-tooth tiger, dodo, phoenix, griffin, yeti, bigfoot, spinosaurus,
ankylosaurus, diplodocus, dinosaur egg, fossil

## Nature and weather

art: draw

rainbow, thunder, lightning, storm, tornado, hurricane, fog, icicle,
snowflake, snowman, snowball, puddle, mud, dirt, sand, rock (stone), pebble,
seashell, ocean, lake, river, pond, waterfall, mountain, hill, volcano, cave,
forest, jungle, desert, island, sky, star, planet, earth, space, sunset,
sunrise, leaf, pinecone, acorn, stick, branch, log, bush, plant, seed, garden,
dandelion, rose, sunflower, daisy, cactus, weather, spring, summer, autumn,
winter, fire, campfire, smoke, shadow, wave (ocean), air, dew, frost, hail,
sleet, heat wave, thundercloud, raindrop, snowstorm, blizzard, earthquake,
flood, sunshine, moonlight, full moon, half moon, crescent moon,
shooting star, comet, meteor, galaxy, spaceship, satellite, Mars, Saturn,
Jupiter, solar system, crystal, gem, diamond (gem), field, meadow, orchard,
vineyard, apple tree, palm tree, pine tree, tree stump, tree house, bird nest,
beehive, anthill, spider web, weed, clover, four-leaf clover, lily pad,
seaweed, coral, tide pool, sand dune, cliff, canyon, valley, glacier, iceberg,
south pole

## Body and health

art: draw

belly button, elbow, wrist, ankle, thumb, fingernail, toenail, chin, cheek,
lips, eyebrow, eyelash, forehead, skin, bone, blood, heart, brain, lungs,
stomach, bottom, chest, braces, boo-boo, scrape, bruise, bug bite, splinter,
rash, itch, headache, stomachache, earache, toothache, sore throat,
runny nose, stuffy nose, allergies, asthma, inhaler, shot, cast, stitches,
cough drop, vitamins, checkup, x-ray, germs, seizure, feeding tube, therapy,
speech therapy, hearing aid, thermometer, nebulizer, oxygen, mask,
hand sanitizer, a cold, flu, covid test, virus, diarrhea, constipated, gas,
nosebleed, loose tooth, lost tooth, tooth fairy, baby tooth, cavity,
eye drops, ear drops, hospital bed, IV, blood test, surgery, doctor visit,
sick day, bedrest, heartbeat, pulse, breath, hiccups, goosebumps, freckles,
mole (skin), dimple, scar, birthmark, tears, snot, sweat, drool, pimple,
sunburn, bee sting, poison ivy, chicken pox, ear infection, pink eye,
strep throat, broken bone, sprain, growth chart, height, weight, hip, thigh,
shin, heel, palm, knuckle, armpit, jaw, gums, throat, voice, muscles, ribs,
spine, haircut, ponytail, braid, pigtails, bangs, curly hair, beard, mustache,
pee pee, private parts, period, pads, potty seat, potty chair, diaper change

## Clothing

art: draw

hoodie, t-shirt, tank top, leggings, jeans, overalls, onesie, tights,
sneakers, rain boots, flip-flops, cap, baseball cap, beanie, headband,
hair bow, helmet, earmuffs, goggles, life jacket, costume, uniform, tutu,
tie (necktie), necklace, bracelet, ring, earrings, watch (wristwatch), apron,
hood, sleeve, vest, jersey, snow pants, shoelaces, velcro, nightgown,
polo shirt, dress shoes, water shoes, light-up shoes, cleats, ballet shoes,
tap shoes, bathrobe, bra, briefs, boxers, training pants, swim diaper,
rash guard, wetsuit, cover-up, sun hat, bucket hat, winter hat, ski mask,
neck warmer, snow boots, puffy coat, rain jacket, windbreaker, cardigan,
blazer, suit, gown, party dress, princess dress, superhero cape, cape, crown,
tiara, wand, wings, fairy wings, cowboy hat, cowboy boots, pirate hat,
witch hat, bunny ears, cat ears, face paint, tattoo, hair clip, scrunchie,
barrette, lanyard, name tag, fanny pack

## School and art

art: draw

pencil, pen, paintbrush, easel, clay, glitter, chalkboard, whiteboard,
homework, worksheet, test, spelling, reading, math, science, art, recess,
cubby, locker, circle time, alphabet, letters, shapes, circle, square,
triangle, rectangle, oval, diamond shape, heart shape, star shape, principal,
field trip, school supplies, pencil case, pencil box, colored pencils,
watercolors, finger paint, paint cup, smock, construction paper, poster,
posterboard, craft, craft stick, pipe cleaner, pom-pom, googly eyes, beads,
yarn, felt, stamp pad, stencil, coloring page, coloring book, sketchbook,
journal, diary, reading book, library book, chapter book, picture book,
flash cards, sight words, word wall, number line, hundreds chart, clock face,
calculator, abacus, counting bears, pattern blocks, tangram, microscope,
magnet, science experiment, show and tell, morning meeting, calendar time,
snack time, quiet time, free time, choice time, center time, story time,
music class, art class, gym class, PE, library time, computer lab, lunch line,
bus line, fire drill, assembly, school play, spelling test, report card,
gold star, sticker reward, prize box, class pet, class job, line leader,
helper, teacher's desk, partner, group work, quiet corner, calm down corner,
sensory room, speech room, resource room, IEP, dry erase board, glue bottle,
hole punch, paper clip, rubber band, pushpin, clipboard, index card,
sticky note, highlighter, permanent marker, pencil grip, typing, handwriting,
cursive, tracing, cutting practice, spelling words, math facts,
homework folder, school picture, yearbook, graduation cap

## People

art: draw

nana, papa, mimi, gigi, granny, pop-pop, meemaw, peepaw, abuela, abuelo,
nonna, nonno, oma, opa, bubbe, zayde, yaya, lola, lolo, auntie, stepmom,
stepdad, twin, baby brother, baby sister, big brother, big sister,
best friend, boyfriend, girlfriend, classmate, coach, mail carrier, cashier,
waiter, chef, farmer, pilot, mechanic, vet, barber, hairdresser, lifeguard,
construction worker, garbage collector, soldier, king, queen, prince,
princess, knight, pirate, ninja, cowboy, cowgirl, clown, magician, superhero,
villain, witch, wizard, ghost, fairy, mermaid, monster, alien, zombie,
vampire, werewolf, mummy, giant, troll, elf, gnome, dwarf, grown-up, stranger,
guest, team, godmother, godfather, great-grandma, great-grandpa, niece,
nephew, foster mom, foster dad, caregiver, nanny, au pair, daycare teacher,
speech therapist, OT, PT, ABA therapist, bus aide, crossing guard, janitor,
lunch lady, school nurse, librarian, dancer, singer, artist, musician,
scientist, engineer, builder, painter, plumber, electrician, delivery driver,
truck driver, train driver, sailor, fisherman, zookeeper, ranger, judge,
president, mayor, pastor, priest, rabbi, imam, bully, boss, customer,
audience, crowd, grandparents, parents, twins, triplets, newborn, toddler,
big kid, teenager, adult, old man, old lady

## Places

art: draw

backyard, garage, attic, porch, driveway, grandma's house, friend's house,
temple, mosque, synagogue, bank, post office, car wash, barbershop,
hair salon, pharmacy, vet office, fire station, police station, bakery,
ice cream shop, coffee shop, pet store, toy store, bookstore, water park,
splash pad, trampoline park, bounce house, arcade, bowling alley,
skating rink, aquarium, amusement park, fair (carnival), circus, camp, hotel,
city, neighborhood, sidewalk, crosswalk, parking lot, elevator, escalator,
bus stop, train station, stadium, concert, party, nurse's office,
principal's office, office, daycare, preschool, kindergarten, therapy clinic,
children's hospital, emergency room, urgent care, eye doctor, orthodontist,
farmers market, flea market, garage sale, car dealership, drive-thru,
food court, pizza place, buffet, diner, taco truck, food truck,
ice cream truck, hot dog stand, lemonade stand, candy store, dollar store,
clothing store, shoe store, hardware store, laundromat, dry cleaner,
dance studio, karate class, swim lessons, soccer field, baseball field,
basketball court, tennis court, golf course, mini golf, go-kart track,
race track, skate park, bike path, hiking trail, nature center,
botanical garden, science center, children's museum, planetarium, theater,
puppet show, magic show, ballet recital, music lesson, piano lesson,
church service, Sunday school, cemetery, city hall, cruise ship, marina,
harbor, lighthouse, bridge, tunnel, highway, dirt road, country road,
farm stand, petting zoo, pumpkin patch, apple orchard, ski resort,
beach house, cabin, cottage, campsite, RV park, rest stop, public bathroom,
changing room, waiting room, lobby, rooftop, playroom, nursery, laundry room,
dining room, family room, front yard, side yard, treehouse, playhouse,
greenhouse, barn, chicken coop, stable, pasture

## Vehicles

art: draw

garbage truck, dump truck, cement mixer, excavator, bulldozer, crane,
tow truck, monster truck, race car, taxi, pickup truck, golf cart, go-kart,
kayak, submarine, hot air balloon, jet, roller skates, tricycle, mail truck,
wheel, tire, horn, siren, sailboat, speedboat, ferry, jet ski, paddle board,
raft, row boat, tugboat, cargo ship, semi truck, delivery truck, moving truck,
recycling truck, street sweeper, snow plow, forklift, backhoe, digger,
dirt bike, ATV, four-wheeler, dune buggy, jeep, convertible, limo, minivan,
SUV, sports car, ladder truck, rescue helicopter, cable car, gondola,
ski lift, trolley, tram, streetcar, monorail, steam train, freight train,
bullet train, caboose, train tracks, railroad crossing, space shuttle,
lunar rover, drone, glider, blimp, seaplane, jumbo jet, fighter jet, tank,
training wheels, balance bike, kick scooter, electric scooter, hoverboard,
unicycle, rollerblades, snowmobile, horse and buggy, carriage, hayride,
car ride, bus ride, train ride, boat ride, Uber

## Toys and play

art: draw

water table, water gun, water balloon, floaties, beach ball, kite, frisbee,
yo-yo, marbles, cards, dice, checkers, chess, dominoes, magnets, dollhouse,
play kitchen, tea party, puppet, teddy bear, rocking horse, hula hoop, slime,
fidget spinner, squishy (toy), stress ball, kinetic sand, piñata, drum,
guitar, piano, xylophone, maracas, tambourine, microphone, hide and seek, tag,
peekaboo, Simon says, duck duck goose, ring around the rosie, hopscotch,
piggyback ride, rock paper scissors, red light green light, musical chairs,
ball pit, monkey bars, seesaw, merry-go-round, zip line, fort, soccer,
baseball, basketball, football, tennis, golf, hockey, swimming, gymnastics,
karate, ballet, bowling, T-ball, baseball bat, goal, prize, toy box, play mat,
activity cube, shape sorter, stacking cups, ring stacker, nesting dolls,
pull toy, push toy, ride-on toy, play food, cash register, toy phone, rattle,
teether, baby gym, jumper, bouncer, tummy time, finger puppet, sock puppet,
puppet theater, marble run, train set, toy airplane, toy boat, rubber duck,
bath crayons, sand bucket, sand shovel, sandcastle, sidewalk chalk,
bubble wand, bubble machine, pinwheel, spinning top, jack-in-the-box,
music box, snow globe, kaleidoscope, glow stick, light-up toy, sound book,
touch and feel book, pop-up book, lift the flap book, board book,
sticker book, activity book, maze, word search, dot-to-dot, jigsaw puzzle,
floor puzzle, peg puzzle, memory game, matching game, card game, go fish,
old maid, tic-tac-toe, I spy, twenty questions, charades, freeze dance,
dance party, karaoke, sing-along, pretend play, doctor kit, tool set,
dress-up box, magic wand, toy sword, shield, toy gun, bow and arrow, nerf gun,
army men, toy animals, farm set, dinosaur set, play tent, play tunnel,
climbing dome, jungle gym, rope swing, tire swing, slip and slide,
snowball fight, sledding, snow angel, leaf pile, mud pie, treasure hunt,
scavenger hunt, egg hunt, obstacle course, relay race, three-legged race,
sack race, tug of war, capture the flag, dodgeball, kickball, four square,
tetherball, tickle fight, pillow fight, wrestling

## Sounds and exclamations

art: draw

uh-oh, yay, yum, yuck, ew, whoa, oh no, ouch, achoo, boo, ta-da, hooray, shh,
hmm, huh, oh, ah, brr, phew, woo-hoo, yippee, whee, vroom, beep beep,
choo choo, honk honk, wee-oo, zoom, boom, splish splash, knock knock,
ding dong, tick tock, moo, oink, woof, meow, quack, baa, neigh, cluck,
cock-a-doodle-doo, roar, hiss, ribbit, tweet, buzz, hoot, squeak, growl, purr,
gobble, night-night, boop, mwah, high five, fist bump, thumbs up, thumbs down,
hey, gotcha, oh yeah, uh-huh, uh-uh, nope, yep, yeah, okie dokie, whatever,
duh, oh man, aw, aww, bravo, ha ha, hee hee, ho ho ho, arr, rawr, grr, zzz,
blah blah, la la la, beep boop, pew pew, kaboom, kapow, wham, splat, thud,
plop, chomp, crunch, slurp, gulp, toot, whoosh, swoosh, ring ring, cheers,
bless you, gesundheit, dibs, jinx, psst, ahem, ugh, meh, eek, yikes, oof,
whew, bingo, bullseye, oopsie, oopsie daisy, all gone, see ya, peace out,
later gator, hiya, howdy, nice try, pinky promise, cross my heart,
just kidding

## Time, days and numbers

art: draw

eleven, twelve, thirteen, fourteen, fifteen, sixteen, seventeen, eighteen,
nineteen, twenty, thirty, forty, fifty, sixty, seventy, eighty, ninety,
hundred, thousand, million, zero, second, third, fourth, fifth, half hour,
quarter, dozen, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday,
Sunday, weekend, week, month, year, day, noon, midnight, o'clock, January,
February, March (month), April, May (month), June, July, August, September,
October, November, December, holiday, vacation, school day, day off,
early morning, late night, tonight, this morning, next week, last week,
next year, last year, someday, forever, a long time, a little while,
in a minute, right now, all day, every day, one more minute, five minutes,
bedtime story, lunchtime, bath time, dinnertime, playtime, screen time,
nap time, clean up time, days of the week, months of the year, seasons, age,
how old, years old, half birthday

## Birthday

art: draw

birthday, birthday party, party hat, candles, goody bag, party favor,
invitation, birthday card, birthday present, birthday song, party games,
cake and ice cream, balloon animal, face painting, bounce castle, party room,
blow out candles, make a wish, birthday crown, birthday girl, birthday boy,
sleepover party, pool party, pajama party, surprise party

## Christmas and winter holidays

art: draw

Christmas, Christmas tree, Santa, reindeer, elf on the shelf, sleigh,
stocking, ornament, Christmas lights, wreath, candy cane, gingerbread man,
gingerbread house, chimney, North Pole, Christmas Eve, Christmas morning,
cookies for Santa, milk for Santa, letter to Santa, sleigh bells, mistletoe,
nativity, angel, snow day, ugly sweater, Christmas card, Christmas carol,
Christmas movie, Christmas dinner, Hanukkah, menorah, dreidel, latkes, gelt,
Kwanzaa, kinara, Winter break, Santa hat, stocking stuffer, wrapping presents,
unwrapping presents, tree topper, advent calendar, Boxing Day

## New Year and other holidays

art: draw

New Year, New Year's Eve, fireworks, countdown, confetti, noisemaker,
party popper, Lunar New Year, red envelope, dragon dance, lion dance, lantern,
Diwali, diya, rangoli, Eid, Ramadan, iftar, Passover, seder, matzo,
Rosh Hashanah, Yom Kippur, Holi, Easter, Easter Bunny, Easter egg,
Easter basket, egg dyeing, Valentine's Day, valentine, Valentine card,
Saint Patrick's Day, leprechaun, shamrock, pot of gold, Fourth of July,
parade, barbecue, sparkler, Mother's Day, Father's Day, Grandparents Day,
Memorial Day, Labor Day, Martin Luther King Day, Presidents Day, Earth Day,
Cinco de Mayo, Day of the Dead, Juneteenth, first day of school,
last day of school, graduation, wedding, funeral, baby shower, family reunion,
play date, picnic, camping, road trip, beach day

## Halloween and Thanksgiving

art: draw

Halloween, trick or treat, pumpkin, jack-o'-lantern, skeleton, haunted house,
candy bag, costume party, carving pumpkins, pumpkin seeds, candy corn,
black cat, broomstick, cauldron, graveyard, tombstone, cobweb, scarecrow,
hay bale, corn maze, fall festival, trunk or treat, Thanksgiving, pumpkin pie,
stuffing, cranberry sauce, turkey dinner, wishbone, harvest, cornucopia,
thankful, football game, Thanksgiving parade

## Brand foods and drinks

art: draw

Coke, Diet Coke, Pepsi, Sprite, 7UP, Dr Pepper, Mountain Dew, Fanta,
root beer, ginger ale, Capri Sun, Gatorade, Powerade, Kool-Aid,
Hawaiian Punch, SunnyD, Juicy Juice, Honest Kids, Minute Maid, Tropicana,
Yoo-hoo, Nesquik, Horizon milk, PediaSure, Pedialyte, LaCroix, Snapple,
Arizona tea, Prime, BodyArmor, ICEE, Slurpee, Goldfish (crackers), Cheez-It,
Cheetos, Flamin' Hot Cheetos, Doritos, Takis, Pringles, Lay's, Ruffles,
Fritos, Tostitos, SunChips, Funyuns, Bugles, Veggie Straws, Pirate's Booty,
Bamba, Ritz, Triscuit, Wheat Thins, Teddy Grahams, graham crackers,
animal crackers, Nutter Butter, Chex Mix, Combos, Lunchables, Uncrustables,
Babybel, Laughing Cow, Go-Gurt, Danimals, Kraft Mac and Cheese, Annie's,
Velveeta, SpaghettiOs, Chef Boyardee, Campbell's soup, Cup Noodles,
Hot Pockets, Bagel Bites, Pizza Rolls, Dino Nuggets, Eggo, Pop-Tarts,
Toaster Strudel, Nutella, Welch's fruit snacks, Gushers, Fruit Roll-Ups,
Fruit by the Foot, GoGo squeeZ, Nature Valley, Nutri-Grain,
Rice Krispies Treats, Cheerios, Honey Nut Cheerios, Froot Loops, Apple Jacks,
Frosted Flakes, Lucky Charms, Cinnamon Toast Crunch, Cocoa Puffs,
Cap'n Crunch, Rice Krispies, Trix, Cocoa Pebbles, Fruity Pebbles,
Golden Grahams, Chex, Kix, Reese's Puffs, Oreos, Chips Ahoy, Nilla Wafers,
Little Debbie, Twinkies, Girl Scout cookies, Kit Kat, Snickers, M&M's,
Reese's, Hershey's, Hershey's Kisses, Twix, Milky Way, 3 Musketeers, Skittles,
Starburst, Sour Patch Kids, Swedish Fish, Nerds, Airheads, Jolly Rancher,
Tootsie Roll, Tootsie Pop, Ring Pop, Push Pop, Dum Dums, Laffy Taffy,
Twizzlers, Haribo, gummy worms, Hi-Chew, Mentos, Pez, Tic Tac, Peeps,
Dunkaroos, Jell-O, Snack Pack, Cool Whip, Dippin' Dots, Hawaiian rolls,
crescent rolls, Kraft Singles, Cheese Nips, Clif Kid, Kind bar, Larabar,
Belvita, Sour Punch, Warheads, Lemonheads, Mike and Ike, Hot Tamales,
Junior Mints, Whoppers, Milk Duds, Butterfinger, Baby Ruth, Almond Joy,
Mounds, York peppermint, Andes mints, Kinder egg, Kinder Joy, Ferrero Rocher,
Lindt, Toblerone, Cadbury egg, Lifesavers, Blow Pop, Bubble Tape, Hubba Bubba,
Big League Chew, Trident, Extra gum, Zebra Cakes, Swiss Rolls, Honey Buns,
Oatmeal Creme Pie, Cosmic Brownies, Klondike bar, Drumstick cone, Good Humor,
Ben and Jerry's, Blue Bell, Häagen-Dazs, Outshine bar, Otter Pops,
Fla-Vor-Ice, Fruttare, Yasso, Heinz ketchup, Hidden Valley ranch,
French's mustard, Hellmann's mayo, Sriracha, Tapatío, Frank's Red Hot, Jif,
Skippy, Smucker's, Welch's grape juice, Mott's apple juice, Mott's applesauce,
Tyson chicken, Perdue nuggets, Ore-Ida fries, Kid Cuisine, DiGiorno, Totino's,
Red Baron, Tombstone pizza, Jimmy Dean, Mrs. Butterworth's,
Pillsbury cinnamon rolls, Bisquick pancakes, Quaker oatmeal, Cream of Wheat,
Kodiak cakes, Thomas bagels, Wonder bread, Dave's Killer Bread, Famous Amos,
Planters, Blue Diamond, Chobani, Yoplait, Dannon, Oikos, Activia, Siggi's,
Stonyfield, Fairlife, Lactaid, Silk, Oatly, Hamburger Helper, Rice-A-Roni,
Minute Rice, Stove Top, Old El Paso, Cheez Whiz, Easy Cheese, Slim Jim,
Jack Link's, Oscar Mayer, Ball Park franks, Hebrew National, Nathan's,
Hormel chili, Spam, Vienna sausages, Bumble Bee tuna, StarKist,
Gorton's fish sticks, Van de Kamp's, Birds Eye, Green Giant, Del Monte, Dole,
Chiquita, Cuties, Halos, Driscoll's, Ocean Spray, Craisins, Sun-Maid raisins,
Annie's bunnies, Plum Organics, Gerber, Gerber puffs, Happy Baby,
Earth's Best, Similac, Enfamil, Huggies, Pampers, Pull-Ups, Band-Aid, Kleenex,
Purell, Q-tips, Vaseline, ChapStick, Aquaphor, Desitin, Tylenol, Motrin,
Benadryl, Children's Advil, Flintstones vitamins, gummy vitamins, Vicks,
Crest, Colgate, Oral-B, Dove soap, Johnson's baby shampoo, Mr. Bubble

## Brand toys and things

art: draw

Hot Wheels, Nerf, Duplo, Magna-Tiles, Squishmallow, Pop It, Beyblade, Crayola,
Slinky, Rubik's Cube, Mr. Potato Head, L.O.L. Surprise, Uno, Candy Land,
Chutes and Ladders, Connect 4, Jenga, Hungry Hungry Hippos, Monopoly, Twister,
Guess Who, Cozy Coupe, Tonka, Power Wheels, Yoto, Tonies, Crocs,
Nintendo Switch, PlayStation, Xbox, Alexa, Kindle, iPhone, Apple Watch,
AirPods, Etch A Sketch, Lite-Brite, Spirograph, Silly Putty,
Play-Doh Fun Factory, Little Tikes, Fisher-Price, VTech, LeapFrog,
Melissa and Doug, Radio Flyer, Razor scooter, Stomp Rocket, Water Wow,
Hatchimals, Furby, Tamagotchi, Barbie Dreamhouse, American Girl doll,
Cabbage Patch, Baby Alive, Bitty Baby, Build-A-Bear, Beanie Babies, Webkinz,
Jellycat, Magformers, K'NEX, Lincoln Logs, Tinkertoys, Mega Bloks, Brio,
Matchbox, Micro Machines, Tech Deck, Hexbug, Bunch O Balloons, Super Soaker,
Wiffle ball, Spikeball, Boogie board, Sno-Cone machine, Easy-Bake Oven,
Shrinky Dinks, Perler beads, Rainbow Loom, Orbeez, Mad Mattr, Pokémon cards,
Uno Flip, Spot It, Sorry!, Trouble game, Operation game, Battleship, Clue,
Scrabble Junior, Boggle, Headbanz, Pie Face, Don't Break the Ice,
Crocodile Dentist, Pop the Pig, Pete the Cat game, Zingo,
Sneaky Snacky Squirrel, Hoot Owl Hoot, Race to the Roof, Mouse Trap, Kerplunk,
Perfection, Simon game, Bop It

## Restaurants and stores

art: draw

McDonald's, Happy Meal, Burger King, Wendy's, Chick-fil-A, Taco Bell, KFC,
Subway (restaurant), Chipotle, Panera, Popeyes, Sonic (restaurant), Arby's,
Five Guys, In-N-Out, Culver's, Whataburger, Jack in the Box (restaurant), Pizza Hut,
Domino's, Papa John's, Little Caesars, Olive Garden, Applebee's, Chili's,
IHOP, Denny's, Cracker Barrel, Red Robin, Texas Roadhouse, Panda Express,
Starbucks, Dunkin', Krispy Kreme, Dairy Queen, Baskin-Robbins, Cold Stone,
Auntie Anne's, Cinnabon, Tim Hortons, Chuck E. Cheese, Dave and Buster's,
Target, Walmart, Costco, Sam's Club, Kroger, Publix, Trader Joe's,
Whole Foods, Aldi, H-E-B, Safeway, Walgreens, CVS, Home Depot, Lowe's, IKEA,
Five Below, Dollar Tree, GameStop, Michaels, Hobby Lobby, PetSmart, Petco,
Old Navy, Build-A-Bear Workshop, Amazon, Disney World, Disneyland, Legoland,
SeaWorld, Six Flags, Sky Zone, YMCA, Great Wolf Lodge, Sesame Place,
Universal Studios, Kohl's, Macy's, TJ Maxx, Marshalls, Ross, Burlington,
Barnes and Noble, Best Buy, Apple Store, Dick's Sporting Goods, Academy,
Bass Pro, Cabela's, Carter's, Gap Kids, Children's Place, Claire's,
Bath and Body Works, Sephora, Ulta, JCPenney, Dillard's, Nordstrom, Meijer,
Wegmans, Food Lion, Stop and Shop, ShopRite, Albertsons, Vons, Ralphs,
Winn-Dixie, Hy-Vee, Sprouts, Fresh Market, Dollar General, Family Dollar,
Big Lots, Joann, Party City, Toys R Us, Jollibee, Raising Cane's, Zaxby's,
Wingstop, Buffalo Wild Wings, Jersey Mike's, Jimmy John's, Firehouse Subs,
Qdoba, Moe's, Del Taco, El Pollo Loco, Bojangles, Church's, White Castle,
Steak 'n Shake, Shake Shack, Smashburger, Freddy's, Portillo's, Rita's, Jamba,
Smoothie King, Tropical Smoothie, Crumbl, Insomnia Cookies,
Nothing Bundt Cakes, Duck Donuts, Carvel, Friendly's, Marble Slab, Menchie's,
Yogurtland, Pinkberry, Waffle House, Bob Evans, Perkins, First Watch,
Cheesecake Factory, Outback, Red Lobster, Golden Corral, Benihana,
P.F. Chang's, Rainforest Cafe, Medieval Times, Main Event, Round1, Urban Air,
My Gym, The Little Gym, Gymboree

## Characters

art: none

Spider-Man, Miles Morales, Spider-Gwen, Batman, Robin (Batman), Joker,
Superman, Wonder Woman, The Flash, Aquaman, Green Lantern, Iron Man,
Captain America, Hulk, Thor, Black Panther, Black Widow, Captain Marvel,
Ant-Man, Hawkeye, Doctor Strange, Groot, Rocket Raccoon, Thanos, Venom,
Wolverine, Catboy, Owlette, Gekko, Power Rangers, Leonardo, Michelangelo,
Raphael, Donatello, Bluey, Bingo (Bluey), Bandit, Chilli, Muffin (Bluey),
Peppa Pig, George Pig, Daddy Pig, Mummy Pig, Daniel Tiger, Ryder,
Chase (Paw Patrol), Marshall, Skye, Rubble, Zuma, Rocky (Paw Patrol),
Everest (Paw Patrol), Liberty, Blippi, Meekah, Ms. Rachel, JJ, Pinkfong, Elmo,
Cookie Monster, Big Bird, Oscar the Grouch, Grover, Abby Cadabby, Bert, Ernie,
The Count, Barney, Dora, Boots (Dora), Swiper, Diego, Blue (Blue's Clues),
Steve (Blue's Clues), Mickey Mouse, Minnie Mouse, Donald Duck, Daisy Duck,
Goofy, Pluto, Winnie the Pooh, Tigger, Piglet (Pooh), Eeyore,
Thomas the Tank Engine, Percy, Curious George, Clifford, Caillou, Arthur,
Doc McStuffins, Gabby, Pandy Paws, Duggee, Sofia the First, Vampirina, Blaze,
Lightning McQueen, Mater, Numberblocks, Alphablocks, Pete the Cat,
Very Hungry Caterpillar, Cat in the Hat, Grinch, Rudolph, Frosty, Paddington,
Peter Rabbit, Kermit, Miss Piggy, Elsa, Anna, Olaf, Sven, Moana, Maui, Stitch,
Lilo, Simba, Nala, Timon, Pumbaa, Ariel, Belle, Cinderella, Snow White,
Rapunzel, Jasmine, Aladdin, Genie, Mulan, Tiana, Merida, Buzz Lightyear,
Woody, Jessie, Nemo, Dory, Mike Wazowski, Sully, WALL-E, Mirabel, Bruno,
Minions, Gru, Shrek, Puss in Boots, Po (Kung Fu Panda), Toothless,
Mr. Incredible, Peter Pan, Tinker Bell, Captain Hook, Dumbo, Bambi, Barbie,
Ken, Harry Potter, Mario, Luigi, Princess Peach, Bowser, Yoshi, Donkey Kong,
Sonic (hedgehog), Tails, Knuckles, Pikachu, Charizard, Eevee, Mewtwo, Ash,
Jigglypuff, Squirtle, Bulbasaur, Charmander, Kirby, Link, Zelda,
Steve (Minecraft), Creeper, Enderman, Huggy Wuggy, Freddy Fazbear,
Skibidi Toilet, Grimace, Hello Kitty, Kuromi, SpongeBob, Patrick Star,
Squidward, Mr. Krabs, Plankton, Scooby-Doo, Shaggy, Bugs Bunny, Tweety,
Garfield, Snoopy, Charlie Brown, Care Bears, My Little Pony,
Strawberry Shortcake, Godzilla, King Kong, Darth Vader, Yoda, Grogu, R2-D2,
Chewbacca, Stormtrooper, Optimus Prime, Poppy (Trolls), Branch (Trolls),
Humpty Dumpty, Ryan (Ryan's World), MrBeast, Leo (Little Einsteins),
Annie (Little Einsteins), Quincy, June (Little Einsteins),
Rocket (Little Einsteins), Mr. Rogers, Bob the Builder, Fireman Sam,
Postman Pat, Noddy, Pingu, Tinky Winky, Dipsy, Laa-Laa, Po (Teletubbies),
Maisy, Spot the Dog, Kipper, Timmy Time, Shaun the Sheep, Wallace and Gromit,
Masha, Bear (Masha), Tayo, Robocar Poli, Pororo, Super Wings, Jett,
Mighty Express, Rusty Rivets, Ricky Zoom, Go Jetters, Captain Barnacles,
Kwazii, Peso, Chris Kratt, Martin Kratt, Tumble Leaf, Llama Llama, Nature Cat,
Molly of Denali, Ada Twist, Rosie Revere, Iggy Peck, Super Why, WordGirl,
Peg + Cat, Sid the Science Kid, Elinor, Charlie and Lola, Timmy Turner,
Jimmy Neutron, Map (Dora), Backpack (Dora), Sid (Toy Story), Rex (Toy Story),
Hamm, Slinky Dog, Bo Peep, Forky, Lotso, Bullseye (Toy Story),
Mr. Potato Head (Toy Story), Aliens (Toy Story), Joy (Inside Out),
Sadness (Inside Out), Anger (Inside Out), Fear (Inside Out),
Disgust (Inside Out), Anxiety (Inside Out), Bing Bong, Remy, Luca,
Mei (Turning Red), Russell (Up), Dug, Carl (Up), Kevin (Up), Marlin, Crush,
Squirt, Hank (Dory), Baymax, Hiro, Wreck-It Ralph, Vanellope, Judy Hopps,
Nick Wilde, Flash (Zootopia), Miguel, Hector, Dante, Pua, Heihei, Tamatoa,
Sisu, Raya, Kristoff, Hans, Marshmallow (Frozen), Bruni, Toodles,
Pete (Mickey), Chip and Dale, Scrooge McDuck, Huey Dewey and Louie,
Darkwing Duck, Launchpad, Baloo, Mowgli, King Louie, Shere Khan, Kaa,
Sebastian, Flounder, Ursula, Lumiere, Cogsworth, Mrs. Potts,
Chip (Beauty and the Beast), Gaston, Beast, Prince Charming, Fairy Godmother,
Gus Gus, Jaq, Dopey, Grumpy (dwarf), Maleficent, Cruella, Hades, Hercules,
Pegasus, Meg, Pocahontas, Meeko, Mushu, Cri-Kee, Rafiki, Zazu,
Scar (Lion King), Mufasa, Kiara, Kion, Abu, Iago, Rajah, Jafar, Flynn Rider,
Pascal, Maximus, Gothel, Naveen, Louis (Tiana), Ray (Tiana), Dr. Facilier

## Shows, movies, games and apps

art: none

Paw Patrol, Sesame Street, CoComelon, Little Einsteins,
Mickey Mouse Clubhouse, Frozen (movie), Toy Story, Cars, Encanto, Lion King,
Inside Out, Trolls, Zootopia, Coco, Wild Kratts, Bubble Guppies,
Super Simple Songs, Ryan's World, Vlad and Niki, Like Nastya, PBS Kids,
Nick Jr., Disney Junior, Netflix, YouTube, YouTube Kids, Disney+, Minecraft,
Roblox, Fortnite, Among Us, Pokémon, Mario Kart, Super Mario, Animal Crossing,
Just Dance, Toca Boca, ABCmouse, Khan Academy Kids, Subway Surfers, Pac-Man,
Tetris, Five Nights at Freddy's, Poppy Playtime, Gabby's Dollhouse, PJ Masks,
Spidey and His Amazing Friends, Teenage Mutant Ninja Turtles, Blue's Clues,
Daniel Tiger's Neighborhood, Thomas and Friends, Octonauts, Team Umizoomi,
Dino Ranch, Puppy Dog Pals, T.O.T.S., SuperKitties, Firebuds,
Hey Bear Sensory, Baby Einstein, Word Party, Storybots, Cocomelon Lane,
Paddington movie, Moana 2, Frozen 2, Toy Story 4, Cars 3, Despicable Me,
Kung Fu Panda, How to Train Your Dragon, Spider-Verse, Lego Movie,
Barbie movie, Wish (movie), Elemental, Turning Red, Up (movie), Finding Nemo,
Finding Dory, Monsters Inc, The Incredibles, Ratatouille,
Beauty and the Beast, Little Mermaid, Tangled, Lilo and Stitch, Jungle Book,
Princess and the Frog, Big Hero 6, Star Wars, Jurassic Park, Jurassic World,
Transformers, Ghostbusters, Tom and Jerry, Looney Tunes, Peanuts (Snoopy),
Sing (movie), Secret Life of Pets, Boss Baby, Madagascar, Ice Age, Rio,
Hotel Transylvania, Cloudy with a Chance of Meatballs, Smurfs,
Alvin and the Chipmunks, Kids Bop, Nintendo, Game Boy, Wii, TikTok, FaceTime,
Spotify, Pandora, Audible, Libby, Epic books, Prodigy math, Duolingo,
Starfall, PBS Kids Games, Pok Pok, Sago Mini, Endless Alphabet, Angry Birds,
Candy Crush, Geometry Dash, Stumble Guys, Brawl Stars, Clash Royale,
Rocket League, Splatoon, Roblox Adopt Me, Brookhaven, Blox Fruits, Bloxburg,
Piggy (Roblox), Doors (Roblox), Obby, Dress to Impress, Pet Simulator,
Grow a Garden

## Songs and rhymes

art: none

Baby Shark, Wheels on the Bus, Twinkle Twinkle Little Star, Old MacDonald,
Itsy Bitsy Spider, Row Row Row Your Boat, If You're Happy and You Know It,
ABC song, Five Little Monkeys, Head Shoulders Knees and Toes,
Baa Baa Black Sheep, Let It Go, We Don't Talk About Bruno,
You Are My Sunshine, Rock-a-bye Baby, Mary Had a Little Lamb,
Happy Birthday song, Hokey Pokey, Five Little Ducks,
Five Little Speckled Frogs, Ten in the Bed, The Ants Go Marching,
This Old Man, London Bridge, Pop Goes the Weasel, Hickory Dickory Dock,
Jack and Jill, Little Miss Muffet, Hey Diddle Diddle, Hush Little Baby,
Skidamarink, Bingo song, Apples and Bananas, Shake Your Sillies Out, Tooty Ta,
Baby Beluga, Clean Up song, Hello song, Goodbye song, Days of the Week song,
Months of the Year song, Counting song, Hot Dog song,
Mickey Mouse Clubhouse song, Paw Patrol theme, Bluey theme, Daniel Tiger song,
Potty song, Brush Your Teeth song, Bath song, Yes Yes Vegetables, Johny Johny,
Finger Family, Five Little Pumpkins, We Wish You a Merry Christmas,
Deck the Halls, Dreidel song, How Far I'll Go, You're Welcome song,
Under the Sea, Hakuna Matata, Circle of Life, A Whole New World, Remember Me,
Surface Pressure, Into the Unknown, Do You Want to Build a Snowman,
Life is a Highway, You've Got a Friend in Me, Can't Stop the Feeling,
Happy (song), Macarena, Chicken Dance, Cha Cha Slide, Cupid Shuffle,
Gummy Bear song, Freeze Dance song, Banana Dance, Choo Choo Cha Boogie

---

# Phrases

Each phrase is recorded as one clip. Two to four words.

## Phrases: urgent and body

art: draw

I'm in pain, my head hurts, my tummy hurts, my ear hurts, my tooth hurts,
my throat hurts, my leg hurts, my arm hurts, it hurts here, I can't breathe,
I feel sick, I'm going to throw up, I need medicine, I need my inhaler,
move me, turn me over, help me sit up, help me up, I'm too hot, I'm too cold,
I'm itchy, I'm dizzy, I fell down, I'm bleeding, I got hurt, someone hurt me,
I need a doctor, call nurse, call mom, call dad, call 911, stay with me,
don't leave me, I'm scared, I'm lost, I want to go home, it's too loud,
turn off lights, too bright, I need a break, give me space, stop touching me,
don't touch that, I need quiet, I need a hug, I'm overwhelmed,
I need my headphones, I need to move, I need to lie down, change my diaper,
I'm wet, I need to poop, I need to pee, I had an accident, I'm hungry now,
I'm thirsty now, not feeling good, something's wrong, I need help now,
it's an emergency, get help, I can't see, I can't hear you, my glasses please,
fix my chair, adjust my seat, too tight, loosen it

## Phrases: daily routines

art: draw

brush teeth, wash hands, wash face, wash hair, put on shoes, take off shoes,
put on coat, take off coat, put on socks, pack backpack, get dressed,
pajamas on, pajamas off, time to eat, set the table, drink water, wipe face,
wipe hands, clean up plate, pour milk, more please, a little more, too much,
cut it please, open it please, I want seconds, I'm full, not hungry,
buckle seatbelt, get in car, get out of car, wait in line, hold my hand,
time for bed, turn off light, leave light on, read a book, one more book,
one more song, tuck me in, recess time, lunch time, open book, sit on rug,
raise hand, go outside, come inside, go to school, go home, go to park,
go to store, go to grandma's, take a bath, take a shower, wash my hair,
dry me off, comb my hair, brush my hair, put on lotion, sunscreen on,
go potty, flush the toilet, wash up, time to go, let's go, get ready,
hurry up, slow down, wait for me, I'm ready, I'm not ready, five more minutes,
turn on TV, turn off TV, watch a show, play a game, play outside,
play with me, feed the dog, walk the dog, water the plants, take out trash,
do homework, charge my iPad, find my shoes, where's my cup, I need a napkin,
I need a spoon, I need a fork, warm it up, cool it down, no crust,
cut in half, on the side, no sauce, I want to cook, I want to help,
can I help, clean my room, make my bed, put it away, pick it up,
sweep the floor, load the dishwasher, fold clothes, get the mail,
answer the door, lock the door, bus is here, school's over, pick me up,
drop me off, I'm home

## Phrases: scripts and feelings

art: draw

look at that, check this out, come with me, let's do it, ready set go,
I did it, watch this, watch me, it's okay, don't worry, take a deep breath,
we can do it, I'm so excited, this is scary, let's get out of here,
what's next, where are we going, let's go outside, I love you, give me a hug,
hold me, I miss you, I'm so happy, I'm really mad, I'm sad, that's funny,
that's so cool, I like it, I don't like it, I love it, I hate it, this is fun,
this is boring, I'm bored, I'm tired, I'm done, I want more, again again,
one more time, do it again, my favorite, not my favorite, I'm proud,
you did it, good job, nice work, great idea, I have an idea, I want to try,
let me try, I can do it, I need help, help me please, I don't understand,
say it again, show me, tell me, what is that, what happened, why not,
how come, I'm thinking, guess what, you know what, I remember, I forgot,
it's broken, fix it please, I'm sorry, it was an accident, I didn't mean it,
forgive me, I'm okay, are you okay, it's my birthday, happy birthday,
merry Christmas, happy Halloween, happy new year, happy Easter,
happy Thanksgiving, happy Hanukkah, happy Diwali, Eid Mubarak,
I want to watch, I want to play, to infinity and beyond, paws on the ground,
no job's too big, let's do this, cowabunga, it's a trap, I am Groot,
wubba wubba, yabba dabba doo, holy moly, oh my goodness, oh my gosh,
you got this, easy peasy, piece of cake, see you soon, bye for now

## Phrases: social

art: draw

see you later, have a good day, thank you so much, no thank you,
leave it alone, that's mine, not right now, I changed my mind,
that's not fair, your turn now, wait a minute, tell me more, excuse me please,
nice to meet you, what's your name, my name is, how are you, I'm good,
I'm fine, what's up, can I play, want to play, you're my friend, be my friend,
I like you, you're funny, you're nice, that's rude, please stop,
leave me alone, go away, come here, sit with me, sit by me, share please,
can I have, can I have some, can I go, can I see, may I, yes please,
no thanks, not yet, maybe later, I don't want to, I want to, let's play,
let's eat, follow me, my turn please, it's my turn, trade with me,
that's my spot, move please, I was first, I'm next, pass it please,
give it back, I need that, stop it, knock it off, cut it out, that hurts,
be nice, be gentle, say sorry, it's okay now, I forgive you, good morning mom,
good night dad, love you too, me too, you too, same here, I agree, I disagree,
you're right, I'm right, good question, I have a question, can you help,
what do you think, do you like it, how was your day, my day was good,
my day was bad, how old are you, where do you live, see you tomorrow,
happy weekend, congratulations, well done, you win, I win, good game, rematch,
let's play again, time out, I quit, I'm back, I'm here, over here, right here,
not there, this one, that one, the other one, the big one, the little one,
all of them, none of them, just one, both please
