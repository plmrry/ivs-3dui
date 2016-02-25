// module.exports = ({ bar, baz }) => console.log(`hey its es6 ${bar}`);

module.exports = () =>
  console.log('hello from foo');

// module.exports = function({ bar }) {
//   let foo = 12;
//   console.log(foo);
// }

// module.exports = function r({x, y, w = 10, h = 10}) {
//   let foo = 12;
//   return x + y + w + h;
// }

module.exports = function({ baz }) {
  console.log('hi from foo', baz)
}