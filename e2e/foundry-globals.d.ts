// Foundry VTT browser-side globals used inside page.evaluate() callbacks.
declare const game: any;
declare const Actor: any;
declare const Item: any;
declare const User: any;
declare const foundry: any;
declare const Hooks: any;

interface Window {
  game: any;
  foundry: any;
  Hooks: any;
}
