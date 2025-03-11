// src/App.js
import React, { useState, useRef, useEffect } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  FeatureGroup, 
  Marker, 
  Popup, 
  useMapEvents 
} from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import './App.css';

// Custom marker icon to fix the missing icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to track mouse position
const MousePositionTracker = ({ onPositionChange }) => {
  useMapEvents({
    mousemove: (e) => {
      const { lat, lng } = e.latlng;
      onPositionChange({ 
        lat: lat.toFixed(6), 
        lng: lng.toFixed(6) 
      });
    }
  });
  return null;
};

// Component for placing markers on click and handling border drawing
const ClickHandler = ({ onMarkerPlace, isMarkingMode, isBorderMode, featureGroupRef }) => {
  const [borderPoints, setBorderPoints] = useState([]);
  const mapRef = useRef();
  
  useMapEvents({
    click: (e) => {
      if (isMarkingMode) {
        onMarkerPlace(e.latlng);
      } else if (isBorderMode) {
        const newPoint = [e.latlng.lat, e.latlng.lng];
        const updatedPoints = [...borderPoints, newPoint];
        setBorderPoints(updatedPoints);
        
        // Clear any existing temporary line
        if (window.tempLine && mapRef.current && mapRef.current.hasLayer(window.tempLine)) {
          mapRef.current.removeLayer(window.tempLine);
        }
        
        // Get the map instance
        mapRef.current = mapRef.current || e.target;
        
        // Draw or update the border line
        if (updatedPoints.length >= 2) {
          window.tempLine = L.polyline(updatedPoints, { color: 'red', weight: 3 });
          window.tempLine.addTo(mapRef.current);
        }
      }
    }
  });
  
  // Complete the polygon when double clicking in border mode
  useMapEvents({
    dblclick: (e) => {
      if (isBorderMode && borderPoints.length >= 3) {
        // Remove the temporary line
        if (window.tempLine && mapRef.current && mapRef.current.hasLayer(window.tempLine)) {
          mapRef.current.removeLayer(window.tempLine);
          window.tempLine = null;
        }
        
        // Create a proper polygon using Leaflet's L.polygon
        const polygon = L.polygon(borderPoints, { color: 'blue', weight: 2 });
        
        // Add the polygon to the feature group
        if (featureGroupRef.current) {
          featureGroupRef.current.addLayer(polygon);
          
          // Create a synthetic "created" event to trigger the same handling as Leaflet Draw
          const syntheticEvent = {
            layerType: 'polygon',
            layer: polygon
          };
          
          // Dispatch a custom event that will be caught by our event listener
          const customEvent = new CustomEvent('border-polygon-created', { 
            detail: syntheticEvent 
          });
          document.dispatchEvent(customEvent);
        }
        
        // Reset border points after creating polygon
        setBorderPoints([]);
      }
    }
  });
  
  // If border mode is turned off, clean up and reset
  useEffect(() => {
    if (!isBorderMode && mapRef.current && window.tempLine) {
      mapRef.current.removeLayer(window.tempLine);
      window.tempLine = null;
      setBorderPoints([]);
    }
  }, [isBorderMode]);
  
  return null;
};

// Unit conversion constants
const UNIT_CONVERSIONS = {
  squareMeters: {
    acres: 0.000247105,
    hectares: 0.0001,
    squareFeet: 10.7639,
    squareKilometers: 0.000001,
    squareMiles: 3.86102e-7
  }
};

const App = () => {
  const [measurements, setMeasurements] = useState({
    squareMeters: 0,
    acres: 0,
    hectares: 0,
    squareFeet: 0,
    squareKilometers: 0,
    squareMiles: 0,
    perimeter: 0
  });
  const [polygons, setPolygons] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [markers, setMarkers] = useState([]);
  const [mousePosition, setMousePosition] = useState({ lat: '0.000000', lng: '0.000000' });
  const [currentPolygon, setCurrentPolygon] = useState(null);
  const [isMarkingMode, setIsMarkingMode] = useState(false);
  const [isBorderMode, setIsBorderMode] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState('squareMeters');
  const featureGroupRef = useRef();
  const mapRef = useRef();

  // Add event listener for custom border polygon creation
  useEffect(() => {
    const handleBorderPolygonCreated = (e) => {
      handleCreate(e.detail);
    };
    
    document.addEventListener('border-polygon-created', handleBorderPolygonCreated);
    
    return () => {
      document.removeEventListener('border-polygon-created', handleBorderPolygonCreated);
    };
  }, [polygons]); // Add polygons as a dependency since handleCreate uses it

  const handleCreate = (e) => {
    const { layerType, layer } = e;
    
    if (layerType === 'polygon') {
      // Get the coordinates from the created polygon
      const latLngs = layer.getLatLngs()[0];
      const coordinates = latLngs.map(latLng => [latLng.lat, latLng.lng]);
      
      // Calculate area and perimeter
      const areaInSquareMeters = calculateArea(coordinates);
      const perimeterInMeters = calculatePerimeter(coordinates);
      
      // Convert to different units
      const areaCalculations = {
        squareMeters: areaInSquareMeters,
        acres: areaInSquareMeters * UNIT_CONVERSIONS.squareMeters.acres,
        hectares: areaInSquareMeters * UNIT_CONVERSIONS.squareMeters.hectares,
        squareFeet: areaInSquareMeters * UNIT_CONVERSIONS.squareMeters.squareFeet,
        squareKilometers: areaInSquareMeters * UNIT_CONVERSIONS.squareMeters.squareKilometers,
        squareMiles: areaInSquareMeters * UNIT_CONVERSIONS.squareMeters.squareMiles,
        perimeter: perimeterInMeters
      };
      
      const newPolygon = {
        id: Date.now(),
        coordinates,
        ...areaCalculations
      };
      
      setMeasurements(areaCalculations);
      
      // Add the polygon to state
      setPolygons([...polygons, newPolygon]);
      
      // Set as current polygon
      setCurrentPolygon(newPolygon);
    }
  };

  const calculateArea = (coordinates) => {
    // Basic area calculation (more accurate implementations would use geodesic calculations)
    // This is a simplified version - real implementation would use a proper geospatial library
    let area = 0;
    for (let i = 0; i < coordinates.length; i++) {
      const j = (i + 1) % coordinates.length;
      area += coordinates[i][0] * coordinates[j][1];
      area -= coordinates[j][0] * coordinates[i][1];
    }
    return Math.abs(area) * 111000 * 111000 / 2; // rough conversion to square meters
  };

  const calculatePerimeter = (coordinates) => {
    // Basic perimeter calculation
    let perimeter = 0;
    for (let i = 0; i < coordinates.length; i++) {
      const j = (i + 1) % coordinates.length;
      const dx = coordinates[i][0] - coordinates[j][0];
      const dy = coordinates[i][1] - coordinates[j][1];
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter * 111000; // rough conversion to meters
  };

  const handleMarkerPlace = (latlng) => {
    if (isMarkingMode) {
      const newMarker = {
        id: Date.now(),
        position: [latlng.lat, latlng.lng],
        label: `Marker ${markers.length + 1}`
      };
      setMarkers([...markers, newMarker]);
    }
  };

  const toggleMarkingMode = () => {
    setIsMarkingMode(!isMarkingMode);
    if (isBorderMode) setIsBorderMode(false);
  };

  const toggleBorderMode = () => {
    setIsBorderMode(!isBorderMode);
    if (isMarkingMode) setIsMarkingMode(false);
  };

  const removeMarker = (markerId) => {
    setMarkers(markers.filter(marker => marker.id !== markerId));
  };

  const detectBoundaries = async () => {
    setIsProcessing(true);
    setErrorMessage('');
    
    try {
      // Get the current map bounds
      const mapInstance = mapRef.current;
      const bounds = mapInstance.getBounds();
      const center = mapInstance.getCenter();
      const zoom = mapInstance.getZoom();
      
      const response = await axios.post('http://localhost:5000/api/detect-boundaries', {
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
        center: {
          lat: center.lat,
          lng: center.lng,
        },
        zoom: zoom
      });
      
      // Handle the detected boundaries
      if (response.data.boundaries && response.data.boundaries.length > 0) {
        // Clear existing drawn layers
        featureGroupRef.current.clearLayers();
        
        // Add the detected boundaries as new polygons
        const detectedPolygons = [];
        response.data.boundaries.forEach(boundary => {
          const coordinates = boundary.coordinates;
          
          // Create a new polygon and add it to the feature group
          const polygon = L.polygon(coordinates);
          featureGroupRef.current.addLayer(polygon);
          
          // Calculate measurements
          const areaInSquareMeters = calculateArea(coordinates);
          const perimeterInMeters = calculatePerimeter(coordinates);
          
          // Convert to different units
          const areaCalculations = {
            squareMeters: areaInSquareMeters,
            acres: areaInSquareMeters * UNIT_CONVERSIONS.squareMeters.acres,
            hectares: areaInSquareMeters * UNIT_CONVERSIONS.squareMeters.hectares,
            squareFeet: areaInSquareMeters * UNIT_CONVERSIONS.squareMeters.squareFeet,
            squareKilometers: areaInSquareMeters * UNIT_CONVERSIONS.squareMeters.squareKilometers,
            squareMiles: areaInSquareMeters * UNIT_CONVERSIONS.squareMeters.squareMiles,
            perimeter: perimeterInMeters
          };
          
          const newPolygon = {
            id: Date.now() + Math.random(),
            coordinates,
            ...areaCalculations
          };
          
          detectedPolygons.push(newPolygon);
        });
        
        setPolygons([...polygons, ...detectedPolygons]);
        
        if (detectedPolygons.length > 0) {
          setCurrentPolygon(detectedPolygons[0]);
          setMeasurements({
            squareMeters: detectedPolygons[0].squareMeters,
            acres: detectedPolygons[0].acres,
            hectares: detectedPolygons[0].hectares,
            squareFeet: detectedPolygons[0].squareFeet,
            squareKilometers: detectedPolygons[0].squareKilometers,
            squareMiles: detectedPolygons[0].squareMiles,
            perimeter: detectedPolygons[0].perimeter
          });
        }
      } else {
        setErrorMessage('No boundaries detected in this area');
      }
    } catch (error) {
      console.error('Error detecting boundaries:', error);
      setErrorMessage('Error detecting boundaries. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const exportData = () => {
    const exportData = {
      polygons,
      markers
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = 'land-measurements.json';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const copyPolygonCoordinates = () => {
    if (currentPolygon) {
      // Format coordinates as readable text
      const formattedCoords = currentPolygon.coordinates
        .map(coord => `[${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}]`)
        .join(',\n');
      
      navigator.clipboard.writeText(`[\n${formattedCoords}\n]`)
        .then(() => {
          alert('Polygon coordinates copied to clipboard!');
        })
        .catch(err => {
          console.error('Failed to copy coordinates: ', err);
          // Fallback for browsers that don't support clipboard API
          const textArea = document.createElement('textarea');
          textArea.value = `[\n${formattedCoords}\n]`;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          alert('Polygon coordinates copied to clipboard!');
        });
    } else {
      alert('No polygon selected to copy.');
    }
  };

  const handlePolygonSelect = (polygon) => {
    setCurrentPolygon(polygon);
    setMeasurements({
      squareMeters: polygon.squareMeters,
      acres: polygon.acres,
      hectares: polygon.hectares,
      squareFeet: polygon.squareFeet,
      squareKilometers: polygon.squareKilometers,
      squareMiles: polygon.squareMiles,
      perimeter: polygon.perimeter
    });
  };

  // Format the measurement value based on the unit
  const formatMeasurement = (value, unit) => {
    const precision = {
      squareMeters: 2,
      acres: 4,
      hectares: 4,
      squareFeet: 2,
      squareKilometers: 6,
      squareMiles: 6,
      perimeter: 2
    };
    
    return Number(value).toFixed(precision[unit] || 2);
  };

  // Unit labels for display
  const unitLabels = {
    squareMeters: 'm²',
    acres: 'acres',
    hectares: 'ha',
    squareFeet: 'ft²',
    squareKilometers: 'km²',
    squareMiles: 'mi²',
    perimeter: 'm'
  };

  return (
    <div className="app-container">
      <div className="content">
        <div className="map-container">
          <MapContainer 
            center={[40.505, -100.09]} 
            zoom={13} 
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <TileLayer
              attribution='&copy; <a href="https://www.esri.com">Esri</a>'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
            <FeatureGroup ref={featureGroupRef}>
              <EditControl
                position="topright"
                onCreated={handleCreate}
                draw={{
                  rectangle: false,
                  circle: false,
                  circlemarker: false,
                  marker: false,  // We'll handle markers ourselves
                  polyline: true,
                  polygon: true,
                }}
              />
            </FeatureGroup>
            
            {/* Display all the markers */}
            {markers.map(marker => (
              <Marker 
                key={marker.id} 
                position={marker.position}
              >
                <Popup>
                  <div>
                    <strong>{marker.label}</strong><br />
                    Lat: {marker.position[0].toFixed(6)}<br />
                    Lng: {marker.position[1].toFixed(6)}<br />
                    <button onClick={() => removeMarker(marker.id)}>Remove</button>
                  </div>
                </Popup>
              </Marker>
            ))}
            
            {/* Mouse position tracker */}
            <MousePositionTracker onPositionChange={setMousePosition} />
            
            {/* Click handler for marker placement and border drawing */}
            <ClickHandler 
              onMarkerPlace={handleMarkerPlace} 
              isMarkingMode={isMarkingMode}
              isBorderMode={isBorderMode}
              featureGroupRef={featureGroupRef}
            />
          </MapContainer>
          
          <div className="mouse-position">
            Mouse Position: Lat {mousePosition.lat}, Lng {mousePosition.lng}
          </div>
        </div>
        
        <div className="controls-panel">

        <h1>Map Calculator</h1>
          <div className="measurements">
            <h2>Measurements</h2>
            
            <div className="measurement-units">
              <label htmlFor="unit-select">Display unit:</label>
              <select 
                id="unit-select" 
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="unit-select"
              >
                <option value="squareMeters">Square Meters (m²)</option>
                <option value="acres">Acres</option>
                <option value="hectares">Hectares (ha)</option>
                <option value="squareFeet">Square Feet (ft²)</option>
                <option value="squareKilometers">Square Kilometers (km²)</option>
                <option value="squareMiles">Square Miles (mi²)</option>
              </select>
            </div>
            
            <div className="measurements-grid">
              <div className="measurement-item">
                <span className="measurement-label">Area (m²):</span>
                <span className="measurement-value">{formatMeasurement(measurements.squareMeters)} m²</span>
              </div>
              <div className="measurement-item">
                <span className="measurement-label">Area (acres):</span>
                <span className="measurement-value">{formatMeasurement(measurements.acres, 'acres')} acres</span>
              </div>
              <div className="measurement-item">
                <span className="measurement-label">Area (ha):</span>
                <span className="measurement-value">{formatMeasurement(measurements.hectares, 'hectares')} ha</span>
              </div>
              <div className="measurement-item">
                <span className="measurement-label">Area (ft²):</span>
                <span className="measurement-value">{formatMeasurement(measurements.squareFeet, 'squareFeet')} ft²</span>
              </div>
              <div className="measurement-item">
                <span className="measurement-label">Area (km²):</span>
                <span className="measurement-value">{formatMeasurement(measurements.squareKilometers, 'squareKilometers')} km²</span>
              </div>
              <div className="measurement-item">
                <span className="measurement-label">Area (mi²):</span>
                <span className="measurement-value">{formatMeasurement(measurements.squareMiles, 'squareMiles')} mi²</span>
              </div>
              <div className="measurement-item">
                <span className="measurement-label">Perimeter:</span>
                <span className="measurement-value">{formatMeasurement(measurements.perimeter, 'perimeter')} m</span>
              </div>
            </div>
            
            {currentPolygon && (
              <div className="current-polygon">
                <h3>Current Polygon</h3>
                <div className="polygon-coordinates-container">
                  <textarea 
                    className="polygon-coordinates" 
                    readOnly 
                    value={currentPolygon.coordinates
                      .map(coord => `[${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}]`)
                      .join(',\n')}
                  />
                  <button onClick={copyPolygonCoordinates} className="copy-button">
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div className="actions">
            <button 
              onClick={toggleMarkingMode} 
              className={`action-button ${isMarkingMode ? 'active' : ''}`}
            >
              {isMarkingMode ? 'Exit Marker Mode' : 'Place Markers'}
            </button>
            
            <button 
              onClick={toggleBorderMode} 
              className={`action-button ${isBorderMode ? 'active' : ''}`}
            >
              {isBorderMode ? 'Exit Border Mode' : 'Draw Border'}
            </button>
            
            <button 
              onClick={detectBoundaries} 
              disabled={isProcessing}
              className="action-button"
            >
              {isProcessing ? 'Processing...' : 'Detect Boundaries'}
            </button>
            
            <button 
              onClick={exportData} 
              disabled={polygons.length === 0 && markers.length === 0}
              className="action-button"
            >
              Export Data
            </button>
          </div>
          
          {errorMessage && (
            <div className="error-message">
              {errorMessage}
            </div>
          )}
          
          <div className="data-sections">
            <div className="markers-section">
              <h3>Placed Markers</h3>
              {markers.length === 0 ? (
                <p>No markers placed</p>
              ) : (
                <ul>
                  {markers.map(marker => (
                    <li key={marker.id}>
                      <strong>{marker.label}:</strong> {marker.position[0].toFixed(6)}, {marker.position[1].toFixed(6)}
                      <button 
                        onClick={() => removeMarker(marker.id)}
                        className="small-button"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            <div className="polygons-section">
              <h3>Saved Measurements</h3>
              {polygons.length === 0 ? (
                <p>No measurements saved</p>
              ) : (
                <ul>
                  {polygons.map(polygon => (
                    <li 
                      key={polygon.id}
                      className={currentPolygon && currentPolygon.id === polygon.id ? 'selected' : ''}
                      onClick={() => handlePolygonSelect(polygon)}
                    >
                      Area: {formatMeasurement(polygon[selectedUnit], selectedUnit)} {unitLabels[selectedUnit]} | Perimeter: {formatMeasurement(polygon.perimeter, 'perimeter')} m
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;