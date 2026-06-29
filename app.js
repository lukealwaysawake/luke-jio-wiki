const root = document.documentElement;
const button = document.querySelector(".theme-button");
const tocLinks = Array.from(document.querySelectorAll(".toc a"));
const sections = tocLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const savedTheme = localStorage.getItem("luke-gio-wiki-theme");
if (savedTheme === "dark") {
  root.classList.add("dark");
  button.textContent = "라이트";
}

button.addEventListener("click", () => {
  root.classList.toggle("dark");
  const dark = root.classList.contains("dark");
  localStorage.setItem("luke-gio-wiki-theme", dark ? "dark" : "light");
  button.textContent = dark ? "라이트" : "다크";
});

function setActiveToc() {
  let activeId = sections[0]?.id;
  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= 105) activeId = section.id;
  }
  tocLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${activeId}`);
  });
}

setActiveToc();
window.addEventListener("scroll", setActiveToc, { passive: true });
