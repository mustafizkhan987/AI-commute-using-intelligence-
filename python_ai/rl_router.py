import numpy as np
import heapq

class CoordinateGridAI:
    def __init__(self, origin, params, hazards=None, resolution=20):
        """
        Treats the city like a video game grid instead of fixed roads!
        resolution: NxN grid size bounds
        params: dict holding configuration constraints
        """
        self.resolution = resolution
        self.origin = origin
        self.dest = params.get('destination', origin)
        self.hazards = hazards if hazards else []
        
        # Calculate bounding box (Game Map borders) with slight 20% padding
        # So the agent can route "around" the bounding box if a hazard blocks the direct path
        lats = [self.origin['lat'], self.dest['lat']] + [h['lat'] for h in self.hazards]
        lons = [self.origin['lon'], self.dest['lon']] + [h['lon'] for h in self.hazards]
        
        pad_lat = abs(self.origin['lat'] - self.dest['lat']) * 0.2
        pad_lon = abs(self.origin['lon'] - self.dest['lon']) * 0.2
        
        # Avoid zero padding
        pad_lat = max(pad_lat, 0.005)
        pad_lon = max(pad_lon, 0.005)

        self.min_lat = min(lats) - pad_lat
        self.max_lat = max(lats) + pad_lat
        self.min_lon = min(lons) - pad_lon
        self.max_lon = max(lons) + pad_lon
        
        # Grid steps
        self.d_lat = (self.max_lat - self.min_lat) / self.resolution
        self.d_lon = (self.max_lon - self.min_lon) / self.resolution

        self.grid = np.zeros((self.resolution, self.resolution))
        self.apply_hazard_gravity_zones()
        
    def _coord_to_grid(self, lat, lon):
        row = int((lat - self.min_lat) / self.d_lat)
        col = int((lon - self.min_lon) / self.d_lon)
        return (min(max(row, 0), self.resolution - 1), 
                min(max(col, 0), self.resolution - 1))

    def _grid_to_coord(self, row, col):
        lat = self.min_lat + (row * self.d_lat)
        lon = self.min_lon + (col * self.d_lon)
        return {"lat": lat, "lon": lon}

    def apply_hazard_gravity_zones(self):
        """
        Drops 'Danger Gravity' onto the board. 
        Cells near hazards get massive penalty scores, forcing the AI routing engine to dodge them.
        """
        for hazard in self.hazards:
            h_row, h_col = self._coord_to_grid(hazard['lat'], hazard['lon'])
            sev = hazard.get('severity', 'medium')
            
            # Severity mapping base
            danger_core = {'low': 20, 'medium': 50, 'high': 150, 'critical': 500}.get(sev, 50)
            
            # Apply gradient danger penalty to surrounding blocks (AI learns to skirt around it)
            for r in range(max(0, h_row-2), min(self.resolution, h_row+3)):
                for c in range(max(0, h_col-2), min(self.resolution, h_col+3)):
                    dist = abs(r - h_row) + abs(c - h_col)
                    if dist == 0:
                        self.grid[r][c] += danger_core
                    elif dist == 1:
                        self.grid[r][c] += danger_core * 0.5
                    elif dist == 2:
                        self.grid[r][c] += danger_core * 0.1

    def heuristic(self, a, b):
        # Manhattan distance on grid
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def solve_optimal_path(self, mode="balanced"):
        """
        Executes an A* Pathfinding Agent strictly across the generated grid dimension.
        Modes:
        - shortest: completely ignores hazard weights.
        - safest: multiplies hazard penalties by 10x to ensure widespread detour.
        - balanced: standard algorithmic flow.
        """
        start = self._coord_to_grid(self.origin['lat'], self.origin['lon'])
        goal = self._coord_to_grid(self.dest['lat'], self.dest['lon'])
        
        # Edge case: Origin == Dest
        if start == goal:
            return [{"location": self.origin}, {"location": self.dest}]
            
        frontier = []
        heapq.heappush(frontier, (0, start))
        came_from = {start: None}
        cost_so_far = {start: 0}
        
        # Risk Multiplier Configuration
        risk_mod = 1.0
        if mode == "shortest": risk_mod = 0.0 # Blind straight line
        elif mode == "safest": risk_mod = 5.0 # High paranoia

        while frontier:
            _, current = heapq.heappop(frontier)
            
            if current == goal:
                break
                
            # Allow 8-way movement like a true spatial drone/game agent
            for dr, dc in [(0,1), (1,0), (0,-1), (-1,0), (1,1), (-1,-1), (1,-1), (-1,1)]:
                next_cell = (current[0] + dr, current[1] + dc)
                
                # Check bounds
                if not (0 <= next_cell[0] < self.resolution and 0 <= next_cell[1] < self.resolution):
                    continue
                    
                # Calculate physics cost: 1 for straight step, 1.414 for diagonal step
                step_cost = 1.0 if dr == 0 or dc == 0 else 1.414
                
                # Add the hazard danger to the cost calculation natively!
                hazard_cost = self.grid[next_cell[0]][next_cell[1]] * risk_mod
                new_cost = cost_so_far[current] + step_cost + hazard_cost
                
                if next_cell not in cost_so_far or new_cost < cost_so_far[next_cell]:
                    cost_so_far[next_cell] = new_cost
                    priority = new_cost + self.heuristic(next_cell, goal)
                    heapq.heappush(frontier, (priority, next_cell))
                    came_from[next_cell] = current

        # Reconstruct path from goal
        current = goal
        path = []
        
        # If agent never reached the goal (trapped), fallback to drawing a direct line!
        if goal not in came_from:
            return [{"location": self.origin}, {"location": self.dest}]

        while current != start:
            path.append(current)
            current = came_from[current]
        path.append(start)
        path.reverse()
        
        # Translate Grid actions back to literal Earth Coordinates
        coordinates = []
        for cell in path:
            coord = self._grid_to_coord(cell[0], cell[1])
            coordinates.append({"location": coord})
            
        # Ensure absolute perfection on terminals by explicitly snapping first/last points
        coordinates[0] = {"location": self.origin}
        coordinates[-1] = {"location": self.dest}
        
        return coordinates
