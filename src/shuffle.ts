/**
 * Fisher–Yates Shuffle
 *
 * @export
 * @param {Array<any>} array
 * @returns {Array<any>}
 */
export function shuffle(array: Array<any>): Array<any> {
	let counter = array.length;

	// While there are elements in the array
	while (counter > 0) {
		// Pick a random index
		let index = Math.floor(Math.random() * counter);

		// Decrease counter by 1
		counter--;

		// And swap the last element with it
		let temp = array[counter];
		array[counter] = array[index];
		array[index] = temp;
	}

	return array;
}