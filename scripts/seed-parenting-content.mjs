// Seed the existing hardcoded Parenting Hub articles into content_posts.
// Run with: node scripts/seed-parenting-content.mjs

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const authorName = "Baebe Boo Care Team";

const articles = [
  {
    slug: "newborn-essentials-checklist",
    category: "Newborn care",
    title: "The calm, practical newborn essentials checklist",
    excerpt: "What you really need for the first weeks—and what can wait.",
    minutes: 6,
    heroImageUrl: "/parenting/newborn-essentials-checklist-generated.png",
    imageAlt: "Newborn clothing, blanket, hat, brush and rattle arranged on a soft nursery blanket",
    ctaLabel: "Shop newborn essentials",
    ctaHref: "/store",
    body: {
      deck: "The first weeks with a newborn are full enough without a house overflowing with gear. A short list of well-chosen, easy-wash essentials will carry you through — and almost everything else can be picked up later, once you know your baby and your routine.",
      sections: [
        {
          heading: "What you need from day one",
          paragraphs: ["Start with the items you will reach for several times a day. Quantities below are a calm starting point — enough to cover laundry days without a cupboard full of spares."],
          list: [
            "6–8 bodysuits and sleepsuits in soft, breathable cotton — short sleeves suit warm days, with one or two light layers for cool evenings.",
            "Nappies in newborn size, plus unscented wipes or cotton wool for changes.",
            "4–6 muslin cloths for feeds, burps and quick clean-ups.",
            "2–3 light blankets and a safe, flat sleep space with a fitted sheet.",
            "A soft hat for sunny outings and a simple going-home outfit.",
            "A changing mat or a dedicated towel, and a small bag ready for trips out.",
          ],
        },
        {
          heading: "What can wait",
          paragraphs: [
            "Shoes, formal outfits and large toy collections all have their time — just not the first month. Babies outgrow newborn sizes quickly, so buy the next size up only as you need it. If gifts arrive, keep tags on anything you are unsure about and swap for a later size.",
            "The same goes for gadgets. A comfortable chair, good light for night feeds and a washing routine you can manage will do more for your week than most equipment.",
          ],
        },
        {
          heading: "Washing, weather and keeping ahead",
          paragraphs: [
            "Light, quick-dry fabrics are your friend in the Ghanaian heat, and sunshine does the drying for free. Keep a small buffer of clean basics — a couple of extra bodysuits and cloths — so a busy day or a power cut never leaves you without a fresh change.",
          ],
        },
      ],
      note: "Not sure about sizing for a newborn on the way? Our team can help you compare sizes and materials before you buy. Product guidance is never a substitute for medical advice — for anything about your baby's health, speak to a qualified professional.",
    },
  },
  {
    slug: "starting-solids-with-confidence",
    category: "Feeding",
    title: "Starting solids with confidence",
    excerpt: "A gentle guide to readiness, first tastes and less stressful mealtimes.",
    minutes: 7,
    heroImageUrl: "/parenting/starting-solids-with-confidence-generated.png",
    imageAlt: "Silicone feeding bowl, bib, divided plate and first foods arranged on a sunny table",
    ctaLabel: "Shop feeding essentials",
    ctaHref: "/store",
    body: {
      deck: "Starting solids is a milestone, not a race. Most babies are ready around six months, and the goal at first is simply to explore tastes and textures — milk feeds still do most of the work. Keep the pressure low and let curiosity lead.",
      sections: [
        {
          heading: "Signs your baby may be ready",
          paragraphs: ["Every baby develops at their own pace, so watch your child rather than the calendar. Common signs of readiness include:"],
          list: [
            "Sitting up with little support and holding their head steady.",
            "Showing interest in your food — watching, reaching or leaning in at mealtimes.",
            "Being able to move food to the back of the mouth and swallow, rather than pushing it straight back out.",
          ],
        },
        {
          heading: "First tastes, low pressure",
          paragraphs: [
            "Begin with soft, single-ingredient foods, offered one at a time: well-mashed avocado, ripe banana, softly cooked and mashed yam or plantain, or smooth porridge all make gentle first tastes. Wait a day or two between new foods so you can notice how your baby responds, and keep milk feeds going as usual.",
            "Expect mess — it is part of learning. A bib, a wipe-clean mat and a relaxed face from you go a long way. If a food is refused, simply try again another day; it can take many gentle offers before a new taste is accepted.",
          ],
        },
        {
          heading: "Making mealtimes calmer",
          paragraphs: [
            "Offer food when your baby is alert and not too hungry or tired, sit them upright in a secure seat, and keep portions tiny — a spoonful or two is a real start. Eat together when you can; babies learn a great deal from watching you enjoy your own food.",
          ],
        },
      ],
      note: "Questions about allergies, weight gain or feeding difficulties belong with your paediatrician, midwife or health visitor. This guide is a practical starting point, not medical advice.",
    },
  },
  {
    slug: "choosing-first-shoes",
    category: "Product guide",
    title: "How to choose a first pair of shoes",
    excerpt: "Simple fit checks for growing feet and busy first steps.",
    minutes: 4,
    heroImageUrl: "/parenting/choosing-first-shoes-generated.png",
    imageAlt: "First-walker baby shoes with socks and a measuring tape on a light wood bench",
    ctaLabel: "Shop baby shoes",
    ctaHref: "/store",
    body: {
      deck: "Bare feet are best while your little one is learning to balance indoors. First shoes earn their place when walking moves outside — protecting soft feet from hot pavements, rough ground and the odd sharp surprise.",
      sections: [
        {
          heading: "When shoes actually matter",
          paragraphs: [
            "Until your child is walking confidently, socks or soft booties are enough indoors and in the buggy. Look for proper first shoes once steps are happening outdoors regularly — around the compound, at the park, on errands with you. In warm weather, breathable materials matter as much as protection.",
          ],
        },
        {
          heading: "Fit checks that matter",
          paragraphs: ["A good first shoe is simple. Run through these checks before you buy:"],
          list: [
            "About a thumb's width of space beyond the longest toe, with the heel held snugly in place.",
            "A sole that bends easily at the ball of the foot — stiff soles make new walkers work too hard.",
            "Lightweight, breathable uppers that let heat escape on warm days.",
            "A secure fastening your child cannot easily undo, but that you can adjust as feet grow.",
            "No rubbing or red marks after a short trial walk around the shop or house.",
          ],
        },
        {
          heading: "Care, rotation and re-checking",
          paragraphs: [
            "Little feet grow fast — check the fit every six to eight weeks in the first walking year. Air shoes out between wears, rotate two pairs if you can, and re-measure both feet each time you buy; one foot is often slightly larger than the other.",
          ],
        },
      ],
      note: "Our team is happy to help you measure little feet and compare fits in store or over WhatsApp. If you have any concerns about how your child walks, a health professional is the right person to ask.",
    },
  },
  {
    slug: "play-for-growing-minds",
    category: "Play & learn",
    title: "Play ideas for growing minds",
    excerpt: "Low-fuss activities that build language, movement and connection.",
    minutes: 5,
    heroImageUrl: "/parenting/play-for-growing-minds-generated.png",
    imageAlt: "Wooden blocks, shape sorter, board books and soft play toys in a bright play corner",
    ctaLabel: "Shop toys and books",
    ctaHref: "/store",
    body: {
      deck: "Play is how young children learn, and it needs far less equipment than the toy aisle suggests. A handful of well-chosen toys, a few household favourites and your attention will take you a very long way.",
      sections: [
        {
          heading: "For babies (0–12 months)",
          paragraphs: ["In the first year, play is mostly about senses and connection. Short, happy bursts through the day beat one long session."],
          list: [
            "Tummy time on a firm mat, a few minutes at a time, with a toy or your face just in view.",
            "Peekaboo, gentle tickles and songs — repetition is the whole point.",
            "Rattles, teethers and soft blocks to grasp, shake and safely mouth.",
            "Board books with bold pictures; name what you see and let them pat the pages.",
          ],
        },
        {
          heading: "For toddlers (1–3 years)",
          paragraphs: ["Toddlers want to move, copy and test. Offer activities that let them do all three:"],
          list: [
            "Stacking cups or blocks — build towers together and let them enjoy the demolition.",
            "Simple sorting: shapes into a sorter, or spoons into one bowl and cups into another.",
            "Pretend play with a toy phone, a pot and spoon, or a dolly to feed.",
            "Songs with actions, and plenty of safe space to climb, push and pull.",
          ],
        },
        {
          heading: "Keeping it low-fuss",
          paragraphs: [
            "Rotate a small set of toys rather than putting everything out at once — old favourites feel new again after a week away. Follow your child's lead, join in for a few minutes, then let them potter while you get on with your own tasks nearby. That balance of together and independent play is where confidence grows.",
          ],
        },
      ],
      note: "Always choose age-appropriate toys and follow the maker's safety guidance, especially for little ones who still explore with their mouths. Our team can help you check age suitability before you buy.",
    },
  },
];

async function seed() {
  let { data: author } = await supabase
    .from("content_authors")
    .select("id")
    .eq("name", authorName)
    .maybeSingle();

  if (!author) {
    const { data: created, error } = await supabase
      .from("content_authors")
      .insert({ name: authorName, bio: "Practical guidance for real family days.", is_active: true })
      .select("id")
      .single();
    if (error) {
      console.error("Could not create author:", error.message);
      process.exit(1);
    }
    author = created;
    console.log("Created author:", authorName);
  } else {
    console.log("Using existing author:", authorName);
  }

  const authorId = author.id;
  const publishedAt = new Date("2026-07-27T00:00:00Z").toISOString();

  for (const article of articles) {
    const { data: existing } = await supabase
      .from("content_posts")
      .select("id")
      .eq("slug", article.slug)
      .maybeSingle();

    if (existing) {
      console.log(`Skipping existing article: ${article.slug}`);
      continue;
    }

    const { error } = await supabase.from("content_posts").insert({
      author_id: authorId,
      slug: article.slug,
      title: article.title,
      excerpt: article.excerpt,
      body: article.body,
      hero_image_url: article.heroImageUrl,
      image_alt: article.imageAlt,
      status: "published",
      category: article.category,
      minutes: article.minutes,
      cta_label: article.ctaLabel,
      cta_href: article.ctaHref,
      published_at: publishedAt,
      seo_title: article.title,
      seo_description: article.excerpt,
    });

    if (error) {
      console.error(`Could not seed ${article.slug}:`, error.message);
    } else {
      console.log("Seeded article:", article.slug);
    }
  }
}

seed().then(() => process.exit(0));
