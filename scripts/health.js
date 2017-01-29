module.exports = function(robot) {
  return robot.router.get('/', function(req, res) {
    res.statusCode = 200;
    res.write('<html>');
    res.write('<body>');
    res.write('<h2>Healthy!</h2>');
    res.write('</body>');
    res.write('</html>');
    return res.end();
  });
};
