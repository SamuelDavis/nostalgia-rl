import "./index.css";

const main = document.createElement("main");
main.innerText = "Hello, world!";

document.querySelector<HTMLDivElement>("#placeholder")!.replaceWith(main);
