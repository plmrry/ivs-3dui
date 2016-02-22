var app = require('./server.js');

var server = app.listen(app.get('port'), function() {
  console.log(server.address());
});