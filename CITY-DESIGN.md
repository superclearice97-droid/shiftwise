# City workspace — refined simulation

The current background is rendered locally in Canvas by city-world.js. The older generated city-night.jpg is no longer displayed. Trains are articulated five-car models with bogies, couplers, windows, doors and cab lights following a rounded track. Two services use cosine acceleration/braking and station dwell. Roads include cars and pedestrians. Buildings have varied footprints/heights, illuminated window faces, rooftop plant, and aerial beacons. The city remains decorative: its train speed and status describe the simulation, not live transit or financial data.

The city is the initial unlocked view. Top text tabs reveal functional floating financial panels. City returns to the scene. The right inspector dropdown selects train details, actual weekly progress, or view controls. Pan uses pointer drag; zoom and follow controls are available. Existing encryption, lock and sync flows remain. Reduced motion, pause and background suspension apply.

Verified: local Canvas rendered frame inspected; simulation smoke and existing encrypted sync/market/age tests passed. Full browser layout and physical device performance remain unverified in this custom Worker environment.

Latest refinement: near-black building faces, white illuminated windows and roof accents. The inspector now defaults to real weekly financial progress and offers Hours & pay, Goals & progress, Household & savings. Train stats and labels were removed; the simulation is ambient background only. Focus, zoom and pause remain presentation controls.

Refresh-rate optimization: removed the 40 ms drawing threshold (previously roughly 25 fps); animation now draws on every available requestAnimationFrame callback. Static ground and per-building sprites are cached and regenerated on scale/resolution changes. Simulation uses elapsed time, independent of display frequency. Pause, reduced-motion and hidden-tab behavior retained. Verified drawing at 8.33 ms intervals and inspected a rendered cached frame; actual 120 fps on user hardware is not measured or guaranteed.
