// Mobile menu toggle
const menuBtn = document.getElementById("menuBtn");
const siteNav = document.getElementById("siteNav");

if (menuBtn && siteNav) {
  menuBtn.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(isOpen));
  });
}

// Funny med school quotes
const quotes = [
  "High yield? My sleep schedule is low yield.",
  "Future doctor loading… please do not ask me to diagnose your rash.",
  "I came, I saw, I said one last topic.",
  "My coffee group is positive.",
  "We are not tired. We are clinically exhausted.",
  "One more lecture and I will start hallucinating MCQs.",
  "Graduation is near. So is my emotional breakdown.",
  "I do not need a differential diagnosis. I need sleep.",
  "The real rotation was the friends we made along the way.",
  "Please ask me anything except pharmacology doses."
];

const randomQuoteEl = document.getElementById("randomQuote");
const newQuoteBtn = document.getElementById("newQuoteBtn");

function getRandomQuote() {
  const index = Math.floor(Math.random() * quotes.length);
  return quotes[index];
}

function setRandomQuote() {
  if (!randomQuoteEl) return;

  let newQuote = getRandomQuote();

  // Avoid showing the same quote twice in a row
  while (newQuote === randomQuoteEl.textContent.trim()) {
    newQuote = getRandomQuote();
  }

  randomQuoteEl.textContent = newQuote;
}

if (newQuoteBtn) {
  newQuoteBtn.addEventListener("click", setRandomQuote);
}

// Set first quote on load
setRandomQuote();

/*
NEXT STEP:
We will add the first-visit group/access card here.

It will:
1. Check IndexedDB for existing groupPath.
2. If no groupPath exists, show a card.
3. User chooses group.
4. User enters access code.
5. We validate code in database.
6. We save groupPath and access status.
*/