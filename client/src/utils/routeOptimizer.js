import { WAREHOUSE_ADDRESS, WAREHOUSE_LOCATION } from '../constants';

const OSRM_BASE_URL = 'https://router.project-osrm.org';

function isValidLocation(location) {
  return (
    Array.isArray(location) &&
    location.length === 2 &&
    Number.isFinite(Number(location[0])) &&
    Number.isFinite(Number(location[1]))
  );
}

function toOsrmCoordinate(location) {
  return `${Number(location[1])},${Number(location[0])}`;
}

function routeOrderDistance(order, matrix, startIndex = 0) {
  let total = 0;
  let previousIndex = startIndex;

  order.forEach((index) => {
    const distance = matrix[previousIndex]?.[index];
    if (Number.isFinite(distance)) total += distance;
    previousIndex = index;
  });

  return total;
}

async function fetchRoadMatrix(locations) {
  const coordinates = locations.map(toOsrmCoordinate).join(';');
  const url = `${OSRM_BASE_URL}/table/v1/driving/${coordinates}?annotations=distance,duration`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('The road-routing service could not calculate the route.');
  }

  const data = await response.json();
  if (data.code !== 'Ok' || !data.distances || !data.durations) {
    throw new Error('The road-routing service returned an invalid response.');
  }

  return {
    distances: data.distances,
    durations: data.durations,
  };
}

async function fetchRoadGeometry(locations) {
  const coordinates = locations.map(toOsrmCoordinate).join(';');
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('The road-routing service could not draw the route.');
  }

  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) {
    throw new Error('The road-routing service returned no drivable route.');
  }

  const selectedRoute = data.routes[0];
  const coordinatesLatLng = selectedRoute.geometry.coordinates.map(
    ([longitude, latitude]) => [latitude, longitude]
  );

  return {
    geometry: selectedRoute.geometry,
    coordinates: coordinatesLatLng,
    distance: selectedRoute.distance / 1000,
    duration: selectedRoute.duration / 60,
  };
}

// Solve the delivery-only travelling-salesperson problem. The warehouse is
// always the fixed route origin; each selected job contributes only its
// delivery destination because the courier collects all parcels at the
// warehouse before leaving.
function findBestDeliveryOrder(deliveries, matrix) {
  const count = deliveries.length;
  if (count === 0) return [];
  if (count === 1) return [0];

  const stateCount = 1 << count;
  const dp = Array.from({ length: stateCount }, () => Array(count).fill(Infinity));
  const parent = Array.from({ length: stateCount }, () => Array(count).fill(-1));

  for (let index = 0; index < count; index += 1) {
    const distance = matrix[0]?.[index + 1];
    if (Number.isFinite(distance)) {
      dp[1 << index][index] = distance;
    }
  }

  for (let mask = 1; mask < stateCount; mask += 1) {
    for (let current = 0; current < count; current += 1) {
      const currentDistance = dp[mask][current];
      if (!Number.isFinite(currentDistance) || !(mask & (1 << current))) continue;

      for (let next = 0; next < count; next += 1) {
        if (mask & (1 << next)) continue;

        const legDistance = matrix[current + 1]?.[next + 1];
        if (!Number.isFinite(legDistance)) continue;

        const nextMask = mask | (1 << next);
        const candidateDistance = currentDistance + legDistance;

        if (candidateDistance < dp[nextMask][next]) {
          dp[nextMask][next] = candidateDistance;
          parent[nextMask][next] = current;
        }
      }
    }
  }

  const fullMask = stateCount - 1;
  let bestLast = -1;
  let bestDistance = Infinity;

  for (let last = 0; last < count; last += 1) {
    if (dp[fullMask][last] < bestDistance) {
      bestDistance = dp[fullMask][last];
      bestLast = last;
    }
  }

  if (bestLast === -1) return deliveries.map((_, index) => index);

  const order = [];
  let mask = fullMask;
  let current = bestLast;

  while (current !== -1) {
    order.push(current);
    const previous = parent[mask][current];
    mask ^= 1 << current;
    current = previous;
  }

  return order.reverse();
}

function buildStops(deliveries, order) {
  return order.map((deliveryIndex, stopIndex) => {
    const delivery = deliveries[deliveryIndex];
    return {
      type: 'delivery',
      stop: stopIndex + 1,
      jobId: delivery.id,
      customer: delivery.customer,
      priority: delivery.priority,
      address: delivery.deliveryAddress,
      location: delivery.deliveryLocation,
      matrixIndex: deliveryIndex + 1,
    };
  });
}

function buildLegs(stops, matrix, durationMatrix) {
  let previousIndex = 0;

  return stops.map((stop, stopIndex) => {
    const currentIndex = stop.matrixIndex;
    const distance = matrix[previousIndex]?.[currentIndex] || 0;
    const duration = durationMatrix[previousIndex]?.[currentIndex] || 0;
    previousIndex = currentIndex;

    return {
      stop: stopIndex + 1,
      type: 'delivery',
      jobId: stop.jobId,
      customer: stop.customer,
      address: stop.address,
      distance: distance / 1000,
      duration: duration / 60,
    };
  });
}

export async function optimiseRoute(deliveries) {
  const validDeliveries = deliveries.filter(
    (delivery) => isValidLocation(delivery.deliveryLocation)
  );

  if (!validDeliveries.length) {
    return {
      route: [],
      stops: [],
      distance: 0,
      originalDistance: 0,
      savedDistance: 0,
      duration: 0,
      geometry: null,
      coordinates: [],
      legs: [],
      isSingleDelivery: false,
      startLocation: [...WAREHOUSE_LOCATION],
      startAddress: WAREHOUSE_ADDRESS,
    };
  }

  const startLocation = [...WAREHOUSE_LOCATION];
  const locations = [startLocation, ...validDeliveries.map((delivery) => delivery.deliveryLocation)];
  const roadMatrix = await fetchRoadMatrix(locations);
  const matrix = roadMatrix.distances;
  const durationMatrix = roadMatrix.durations;

  // Original distance preserves the current delivery list order, but still
  // starts at the warehouse because all parcels originate there.
  const originalOrder = validDeliveries.map((_, index) => index + 1);
  const originalDistance = routeOrderDistance(originalOrder, matrix, 0) / 1000;

  const optimisedOrder = findBestDeliveryOrder(validDeliveries, matrix);
  const optimisedMatrixOrder = optimisedOrder.map((index) => index + 1);
  const matrixOptimisedDistance = routeOrderDistance(optimisedMatrixOrder, matrix, 0) / 1000;
  const matrixOptimisedDuration = optimisedMatrixOrder.reduce(
    (total, index, position) => {
      const previousIndex = position === 0 ? 0 : optimisedMatrixOrder[position - 1];
      return total + (durationMatrix[previousIndex]?.[index] || 0);
    },
    0
  ) / 60;

  const orderedStops = buildStops(validDeliveries, optimisedOrder);

  const geometryRoute = await fetchRoadGeometry([
    startLocation,
    ...orderedStops.map((stop) => stop.location),
  ]);

  const finalDistance = Number.isFinite(geometryRoute.distance)
    ? geometryRoute.distance
    : matrixOptimisedDistance;
  const finalDuration = Number.isFinite(geometryRoute.duration)
    ? geometryRoute.duration
    : matrixOptimisedDuration;

  const legs = buildLegs(orderedStops, matrix, durationMatrix);
  const displayStops = orderedStops.map(({ matrixIndex, ...stop }) => stop);

  return {
    route: displayStops,
    stops: displayStops,
    distance: finalDistance,
    originalDistance,
    savedDistance: Math.max(0, originalDistance - finalDistance),
    duration: finalDuration,
    geometry: geometryRoute.geometry,
    coordinates: geometryRoute.coordinates,
    legs,
    isSingleDelivery: validDeliveries.length === 1,
    startLocation,
    startAddress: WAREHOUSE_ADDRESS,
  };
}

export function formatDistance(distance) {
  return `${Number(distance || 0).toFixed(2)} km`;
}

export function formatEstimatedTime(minutes) {
  if (!minutes) return '0 mins';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} mins`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins ? `${hours} hr ${mins} mins` : `${hours} hr`;
}
