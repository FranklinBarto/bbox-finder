import React, { useState, useRef, useEffect } from 'react';
import { 
  MapContainer, 
  TileLayer, 
  FeatureGroup, 
  Marker, 
  Popup, 
  useMapEvents,
  LayersControl,
  useMap
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

// Unit conversion constants
const UNIT_CONVERSIONS = {
  squareMeters: {
    acres: 0.000247105,
    hectares: 0.0001,
    squareFeet: 10.7639,
    squareKilometers: 0.000001,
    squareMiles: 3.86102e-7
  },
  meters: {
    kilometers: 0.001,
    miles: 0.000621371,
    feet: 3.28084
  }
};

// MapController component to handle map interactions
const MapController = ({ onFlyTo }) => {
  const map = useMapEvents({});
  
  useEffect(() => {
    if (onFlyTo) {
      onFlyTo(map);
    }
  }, [map, onFlyTo]);
  
  return null;
};

// Create a custom component to handle map events
function MapEventHandler({ setMousePosition }) {
  const map = useMap();
  
  // Set up the mousemove event listener
  map.on("mousemove", (e) => {
    setMousePosition({
      lat: e.latlng.lat.toFixed(6),
      lng: e.latlng.lng.toFixed(6),
    });
  });

  return null;
}

const CustomZoomControl = () => {
  const map = useMap();

  useEffect(() => {
    const zoomControl = L.control.zoom({
      position: "bottomleft", // Move zoom controls to bottom-left
    });

    map.addControl(zoomControl);
    
    return () => {
      map.removeControl(zoomControl);
    };
  }, [map]);

  return null;
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
  const [polylines, setPolylines] = useState([]);
  const [currentPolyline, setCurrentPolyline] = useState(null);
  const [polygons, setPolygons] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [markers, setMarkers] = useState([]);
  const [mousePosition, setMousePosition] = useState({ lat: '0.000000', lng: '0.000000' });
  const [currentPolygon, setCurrentPolygon] = useState(null);
  const [isMarkingMode, setIsMarkingMode] = useState(false);
  const [isBorderMode, setIsBorderMode] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState('squareMeters');
  const [selectedDistanceUnit, setSelectedDistanceUnit] = useState('meters');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const featureGroupRef = useRef();
  const mapRef = useRef();
  const searchInputRef = useRef();

  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    // Attach event listener but do NOT interfere with interactivity
    const updateMousePosition = (e) => {
      setMousePosition({
        lat: e.latlng.lat.toFixed(6),
        lng: e.latlng.lng.toFixed(6),
      });
    };

    map.on("mousemove", updateMousePosition);

    return () => {
      map.off("mousemove", updateMousePosition);
    };
  }, []);

  const handleCreate = (e) => {
    const { layerType, layer } = e;
    
    if (layerType === 'polygon' || layerType === 'rectangle') {
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
    } else if (layerType === 'polyline') {
      // Get the coordinates from the created polyline
      const latLngs = layer.getLatLngs();
      const coordinates = latLngs.map(latLng => [latLng.lat, latLng.lng]);
      
      // Calculate distance
      const distanceInMeters = calculatePolylineDistance(coordinates);
      
      // Convert to different units
      const distanceCalculations = {
        meters: distanceInMeters,
        kilometers: distanceInMeters * UNIT_CONVERSIONS.meters.kilometers,
        miles: distanceInMeters * UNIT_CONVERSIONS.meters.miles,
        feet: distanceInMeters * UNIT_CONVERSIONS.meters.feet
      };
      
      const newPolyline = {
        id: Date.now(),
        coordinates,
        ...distanceCalculations
      };
      
      // Add the polyline to state
      setPolylines([...polylines, newPolyline]);
      
      // Set as current polyline
      setCurrentPolyline(newPolyline);
    } else if (layerType=="marker"){
      const latLng = layer._latlng;
        const newMarker = {
          id: Date.now(),
          position: [latLng.lat, latLng.lng],
          label: `Marker ${markers.length + 1}`
        };
        setMarkers([...markers, newMarker]);
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

  const calculatePolylineDistance = (coordinates) => {
    // Calculate the total distance of a polyline
    let distance = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
      const dx = coordinates[i][0] - coordinates[i+1][0];
      const dy = coordinates[i][1] - coordinates[i+1][1];
      distance += Math.sqrt(dx * dx + dy * dy);
    }
    return distance * 111000; // rough conversion to meters
  };

  const removeMarker = (markerId) => {
    setMarkers(markers.filter(marker => marker.id !== markerId));
  };

  // Handle search query change
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    if (e.target.value.length > 2) {
      setShowSearchResults(true);
    } else {
      setShowSearchResults(false);
    }
  };

  // Search for locations
  const searchLocations = async () => {
    if (searchQuery.trim().length < 3) return;

    setIsSearching(true);
    try {
      // Using Nominatim API for geocoding
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`,
        { headers: { 'Accept-Language': 'en-US,en' } }
      );
      
      setSearchResults(response.data);
    } catch (error) {
      console.error('Error searching for location:', error);
      setErrorMessage('Error searching for location. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Handle search submission
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    searchLocations();
  };

  // Fly to location
  const flyToLocation = (result) => {
    const mapInstance = mapRef.current;
    if (mapInstance) {
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      mapInstance.flyTo([lat, lon], 14);
      
      // Add a marker for the searched location
      const newMarker = {
        id: Date.now(),
        position: [lat, lon],
        label: result.display_name.split(',')[0] // Use first part of the name
      };
      setMarkers([...markers, newMarker]);
      
      // Clear search results and query
      setShowSearchResults(false);
      setSearchResults([]);
    }
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
      polylines,
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

  const copyPolylineCoordinates = () => {
    if (currentPolyline) {
      // Format coordinates as readable text
      const formattedCoords = currentPolyline.coordinates
        .map(coord => `[${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}]`)
        .join(',\n');
      
      navigator.clipboard.writeText(`[\n${formattedCoords}\n]`)
        .then(() => {
          alert('Polyline coordinates copied to clipboard!');
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
          alert('Polyline coordinates copied to clipboard!');
        });
    } else {
      alert('No polyline selected to copy.');
    }
  };

  const handlePolygonSelect = (polygon) => {
    setCurrentPolygon(polygon);
    setCurrentPolyline(null);
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

  const handlePolylineSelect = (polyline) => {
    setCurrentPolyline(polyline);
    setCurrentPolygon(null);
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
      perimeter: 2,
      meters: 2,
      kilometers: 3,
      miles: 3,
      feet: 1
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
    perimeter: 'm',
    meters: 'm',
    kilometers: 'km',
    miles: 'mi',
    feet: 'ft'
  };

  // Handle clicking outside search results
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // hook to handle mouse movement
  const MouseMoveHandler = () => {
    useMapEvents({
      mousemove: (e) => {
        setMousePosition({
          lat: e.latlng.lat.toFixed(6),
          lng: e.latlng.lng.toFixed(6),
        });
      },
    });

    return null; // This component does not render anything
  };

  return (
    <div className="app-container">
      <div className="location-bar">
        <form onSubmit={handleSearchSubmit} ref={searchInputRef}>
          <div className="search-container">
            <input
              type="text"
              placeholder="Search for city, town, county..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="search-input"
            />
            <button type="submit" className="search-button" disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
          </div>
          
          {showSearchResults && searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map(result => (
                <div 
                  key={result.place_id} 
                  className="search-result-item"
                  onClick={() => flyToLocation(result)}
                >
                  <div className="result-name">{result.display_name.split(',')[0]}</div>
                  <div className="result-address">{result.display_name}</div>
                </div>
              ))}
            </div>
          )}
        </form>
      </div>
      
      <div className="content">
        <div className="map-container">
          <MapContainer 
            center={[40.505, -100.09]} 
            zoom={13} 
            style={{ height: '100%', width: '100%' }}
            // whenCreated={(map) => { mapRef.current = map; }}
            zoomControl={false}
            whenCreated={(map) => {
              mapRef.current = map;
    
              // Attach mousemove event listener to the map
              map.on("mousemove", (e) => {
                setMousePosition({
                  lat: e.latlng.lat.toFixed(6),
                  lng: e.latlng.lng.toFixed(6),
                });
              });
            }}
          >
            {/* <MapEventHandler setMousePosition={setMousePosition} /> */}
            <MapController 
              onFlyTo={(mapInstance) => { mapRef.current = mapInstance; }}
            />

            <CustomZoomControl/>
            
            {/* <MouseMoveHandler /> */}
            <LayersControl position="topright">
        
              <LayersControl.BaseLayer name="Satellite Imagery" checked>
                <TileLayer
                  attribution='&copy; <a href="https://www.esri.com">Esri</a>'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>

              <LayersControl.BaseLayer name="Vector Map">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              
            </LayersControl>
            
            <FeatureGroup ref={featureGroupRef}>
              <EditControl
                position="topright"
                onCreated={handleCreate}
                draw={{
                  rectangle: true,
                  circle: false,
                  circlemarker: false,
                  marker: true,
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
          </MapContainer>
          
          {/* <div className="mouse-position">
            Mouse Position: Lat {mousePosition.lat}, Lng {mousePosition.lng}
          </div> */}
        </div>
        
        <div className="controls-panel">
          <div className="measurements">
            <h1> Geo Measurements</h1>
            
            {currentPolygon && (
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
            )}
            
            {currentPolyline && (
              <div className="measurements-grid">
                <div className="measurement-item">
                  <span className="measurement-label">Distance (m):</span>
                  <span className="measurement-value">{formatMeasurement(currentPolyline.meters, 'meters')} m</span>
                </div>
                <div className="measurement-item">
                  <span className="measurement-label">Distance (km):</span>
                  <span className="measurement-value">{formatMeasurement(currentPolyline.kilometers, 'kilometers')} km</span>
                </div>
                <div className="measurement-item">
                  <span className="measurement-label">Distance (mi):</span>
                  <span className="measurement-value">{formatMeasurement(currentPolyline.miles, 'miles')} mi</span>
                </div>
                <div className="measurement-item">
                  <span className="measurement-label">Distance (ft):</span>
                  <span className="measurement-value">{formatMeasurement(currentPolyline.feet, 'feet')} ft</span>
                </div>
              </div>
            )}
            
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
            
            {currentPolyline && (
              <div className="current-polyline">
                <h3>Current Polyline</h3>
                <div className="polyline-coordinates-container">
                  <textarea 
                    className="polyline-coordinates" 
                    readOnly 
                    value={currentPolyline.coordinates
                      .map(coord => `[${coord[0].toFixed(6)}, ${coord[1].toFixed(6)}]`)
                      .join(',\n')}
                  />
                  <button onClick={copyPolylineCoordinates} className="copy-button">
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div className="actions">
            <button 
              onClick={detectBoundaries} 
              disabled={true}
              className="action-button"
            >
              {isProcessing ? 'Processing...' : 'Detect Boundaries'}
            </button> 
            
            <button 
              onClick={detectBoundaries} 
              disabled={true}
              className="action-button"
            >
              {isProcessing ? 'Processing...' : 'Track Changes'}
            </button>
            
            <button 
              onClick={exportData} 
              disabled={polygons.length === 0 && polylines.length === 0 && markers.length === 0}
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
              <h3>Saved Area Measurements</h3>
              {polygons.length === 0 ? (
                <p>No area measurements saved</p>
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
            
            <div className="polylines-section">
              <h3>Saved Distance Measurements</h3>
              {polylines.length === 0 ? (
                <p>No distance measurements saved</p>
              ) : (
                <ul>
                  {polylines.map(polyline => (
                    <li 
                      key={polyline.id}
                      className={currentPolyline && currentPolyline.id === polyline.id ? 'selected' : ''}
                      onClick={() => handlePolylineSelect(polyline)}
                    >
                      Distance: {formatMeasurement(polyline[selectedDistanceUnit], selectedDistanceUnit)} {unitLabels[selectedDistanceUnit]}
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