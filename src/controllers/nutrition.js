// Middleware to handle GET requests without body parsing
export function skipBodyParserForGet(req, res, next) {
  if (req.method === 'GET') {
    req._body = false; // Tell body-parser to skip
    req.body = {};
  }
  next();
}

export function getMacroAdvice(req, res) {
  try {
    // Define macro data directly in the controller
    const macroData = [
      {
        name: "Carbs",
        description: "Primary energy source. Aim for 45-65% of daily calories.",
        goodSources: ["Whole grains", "Fruits", "Vegetables", "Legumes"],
        dailyIntake: {
          sedentary: "225-325g",
          moderate: "250-375g",
          active: "300-450g"
        }
      },
      {
        name: "Protein",
        description: "Essential for muscle repair and growth. Aim for 10-35% of daily calories.",
        goodSources: ["Lean meats", "Fish", "Eggs", "Dairy", "Legumes", "Nuts"],
        dailyIntake: {
          sedentary: "46-56g",
          moderate: "56-91g",
          active: "91-130g"
        }
      },
      {
        name: "Fats",
        description: "Important for hormone production and nutrient absorption. 20-35% of daily calories.",
        goodSources: ["Avocados", "Nuts", "Seeds", "Olive oil", "Fatty fish"],
        dailyIntake: {
          sedentary: "44-78g",
          moderate: "50-88g",
          active: "67-117g"
        }
      },
      {
        name: "Fiber",
        description: "Supports digestion and heart health. Aim for 25-38g per day.",
        goodSources: ["Whole grains", "Fruits", "Vegetables", "Legumes", "Nuts"],
        dailyIntake: {
          women: "25g",
          men: "38g"
        }
      }
    ];

    // Set content type to JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Send response with proper formatting
    res.status(200).json({ 
      hasError: false, 
      data: macroData 
    });
  } catch (error) {
    console.error('Error in getMacroAdvice:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        hasError: true, 
        message: 'Failed to fetch macro advice',
        error: error.message 
      });
    }
  }
}

export function getDailyTip(req, res) {
  // If there's any content in the body, it's an invalid request for GET endpoints
  if (req.body && Object.keys(req.body).length > 0) {
    return res.status(400).json({
      hasError: true,
      message: 'This endpoint does not accept a request body',
      receivedBody: req.body
    });
  }
  try {
    const tips = [
      "Stay hydrated! Drink at least 8 glasses of water daily.",
      "Include a source of protein in every meal to stay full longer.",
      "Choose whole grains over refined grains for better nutrition.",
      "Eat a rainbow of fruits and vegetables for a variety of nutrients.",
      "Don't skip breakfast - it kickstarts your metabolism.",
      "Plan your meals ahead to make healthier choices.",
      "Limit added sugars and processed foods.",
      "Practice mindful eating - eat slowly and enjoy your food.",
      "Include healthy fats like avocados and nuts in your diet.",
      "Meal prep on weekends to make healthy eating easier during the week."
    ];

    // Get a random tip
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    
    // Set content type to JSON
    res.setHeader('Content-Type', 'application/json');
    
    // Send response with proper formatting
    res.status(200).json({ 
      hasError: false, 
      data: {
        tip: randomTip,
        date: new Date().toISOString().split('T')[0]
      }
    });
  } catch (error) {
    console.error('Error in getDailyTip:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        hasError: true, 
        message: 'Failed to fetch daily tip',
        error: error.message 
      });
    }
  }
}
