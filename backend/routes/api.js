const express = require('express');
const router = express.Router();
const CommuteScorer = require('../utils/scorer');

let scorer = new CommuteScorer();

router.get('/routes', (req, res) => {
  const routesData = require('../data/routes.json');
  res.json(routesData.routes);
});

router.post('/score', (req, res) => {
  const routesData = require('../data/routes.json');
  
  // Score all routes
  scorer = new CommuteScorer(); // Refresh time-of-day context
  const scoredRoutes = scorer.scoreAllRoutes(routesData.routes);
  
  // Get the best route
  const bestRoute = scorer.getBestRoute(scoredRoutes);
  
  res.json({
    timestamp: new Date().toISOString(),
    routes: scoredRoutes,
    recommendation: {
      bestRoute: bestRoute.routeId,
      reason: bestRoute.recommendation,
      compositeScore: bestRoute.compositeScore
    }
  });
});

module.exports = router;
