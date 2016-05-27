/**
 * @license Copyright (c) 2003-2015, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

import Selection from './selection.js';
import Renderer from './renderer.js';
import Writer from './writer.js';
import DomConverter from './domconverter.js';
import ContainerElement from './containerelement.js';
import { injectQuirksHandling } from './filler.js';

import mix from '../../utils/mix.js';
import EmitterMixin from '../../utils/emittermixin.js';

/**
 * Document class creates an abstract layer over the content editable area.
 * It combines the actual tree of view elements, tree of DOM elements,
 * {@link engine.view.DomConverter DOM Converter}, {@link engine.view.Renderer renderer} and all
 * {@link engine.view.Observer observers}.
 *
 * If you want to only transform the tree of view elements to the DOM elements you can use the
 * {@link engine.view.DomConverter DomConverter}.
 *
 * @memberOf engine.view
 * @mixes utils.EmitterMixin
 */
export default class Document {
	/**
	 * Creates a Document instance.
	 */
	constructor() {
		/**
		 * Roots of the DOM tree. Map on the `HTMLElement`s with roots names as keys.
		 *
		 * @readonly
		 * @member {Map} engine.view.Document#domRoots
		 */
		this.domRoots = new Map();

		/**
		 * Selection done on this document.
		 *
		 * @readonly
		 * @member {engine.view.Selection} engine.view.Document#selection
		 */
		this.selection = new Selection();

		/**
		 * Tree View writer.
		 *
		 * @readonly
		 * @member {engine.view.Writer} engine.view.Document#writer
		 */
		this.writer = new Writer();

		/**
		 * Instance of the {@link engine.view.DomConverter domConverter} use by
		 * {@link engine.view.Document#renderer renderer} and {@link engine.view.observer.Observer observers}.
		 *
		 * @readonly
		 * @member {engine.view.DomConverter} engine.view.Document#domConverter
		 */
		this.domConverter = new DomConverter();

		/**
		 * Roots of the view tree. Map of the {engine.view.Element view elements} with roots names as keys.
		 *
		 * @readonly
		 * @member {Map} engine.view.Document#viewRoots
		 */
		this.viewRoots = new Map();

		/**
		 * Instance of the {@link engine.view.Document#renderer renderer}.
		 *
		 * @readonly
		 * @member {engine.view.Renderer} engine.view.Document#renderer
		 */
		this.renderer = new Renderer( this.domConverter, this.selection );

		/**
		 * Map of registered {@link engine.view.Observer observers}.
		 *
		 * @private
		 * @member {Map.<Function, engine.view.Observer>} engine.view.Document_#observers
		 */
		this._observers = new Map();

		injectQuirksHandling( this );
	}

	/**
	 * Creates observer of the given type if not yet created, {@link engine.view.Observer#enable enables} it
	 * and {@link engine.view.observer.Observer#observe attaches} to all existing and future
	 * {@link engine.view.Document#domRoots DOM roots}.
	 *
	 * Note: Observers are recognized by their constructor (classes). A single observer will be instantiated and used only
	 * when registered for the first time. This means that features and other components can register a single observer
	 * multiple times without caring whether it has been already added or not.
	 *
	 * @param {Function} Observer The constructor of an observer to add.
	 * Should create an instance inheriting from {@link engine.view.observer.Observer}.
	 * @returns {engine.view.observer.Observer} Added observer instance.
	 */
	addObserver( Observer ) {
		let observer = this._observers.get( Observer );

		if ( observer ) {
			return observer;
		}

		observer = new Observer( this );

		this._observers.set( Observer, observer );

		for ( let [ name, domElement ] of this.domRoots ) {
			observer.observe( domElement, name );
		}

		observer.enable();

		return observer;
	}

	/**
	 * Returns observer of the given type or `undefined` if such observer has not been added yet.
	 *
	 * @param {Function} Observer The constructor of an observer to get.
	 * @returns {engine.view.observer.Observer|undefined} Observer instance or undefined.
	 */
	getObserver( Observer ) {
		return this._observers.get( Observer );
	}

	/**
	 * Creates a {@link engine.view.Document#viewRoots view root element}.
	 *
	 * If the DOM element is passed as a first parameter it will be automatically
	 * {@link engine.view.Document#attachDomRoot attached}:
	 *
	 *		document.createRoot( document.querySelector( 'div#editor' ) ); // Will call document.attachDomRoot.
	 *
	 * However, if the string is passed, then only the view element will be created and the DOM element have to be
	 * attached separately:
	 *
	 *		document.createRoot( 'body' );
	 *		document.attachDomRoot( document.querySelector( 'body#editor' ) );
	 *
	 * @param {Element|String} domRoot DOM root element or the tag name of view root element if the DOM element will be
	 * attached later.
	 * @param {String} [name='main'] Name of the root.
	 * @returns {engine.view.ContainerElement} The created view root element.
	 */
	createRoot( domRoot, name = 'main' ) {
		const rootTag = typeof domRoot == 'string' ? domRoot : domRoot.tagName;

		const viewRoot = new ContainerElement( rootTag );
		viewRoot.setDocument( this );

		this.viewRoots.set( name, viewRoot );

		// Mark changed nodes in the renderer.
		viewRoot.on( 'change', ( evt, type, node ) => {
			this.renderer.markToSync( type, node );
		} );

		if ( domRoot instanceof HTMLElement ) {
			this.attachDomRoot( domRoot, name );
		}

		return viewRoot;
	}

	/**
	 * Attaches DOM root element to the view element and enable all observers on that element. This method also
	 * {@link engine.view.Renderer#markToSync mark element} to be synchronized with the view what means that all child
	 * nodes will be removed and replaced with content of the view root.
	 *
	 * Note that {@link engine.view.Document#createRoot} will call this method automatically if the DOM element is
	 * passed to it.
	 *
	 * @param {Element|String} domRoot DOM root element.
	 * @param {String} [name='main'] Name of the root.
	 */
	attachDomRoot( domRoot, name = 'main' ) {
		const viewRoot = this.getRoot( name );

		this.domRoots.set( name, domRoot );

		this.domConverter.bindElements( domRoot, viewRoot );

		this.renderer.markToSync( 'CHILDREN', viewRoot );

		for ( let observer of this._observers.values() ) {
			observer.observe( domRoot, name );
		}
	}

	/**
	 * Gets a {@link engine.view.Document#viewRoots view root element} with the specified name. If the name is not
	 * specific "main" root is returned.
	 *
	 * @param {String} [name='main'] Name of the root.
	 * @returns {engine.view.ContainerElement} The view root element with the specified name.
	 */
	getRoot( name = 'main' ) {
		return this.viewRoots.get( name );
	}

	/**
	 * Gets DOM root element.
	 *
	 * @param {String} [name='main']  Name of the root.
	 * @returns {Element} DOM root element instance.
	 */
	getDomRoot( name = 'main' ) {
		return this.domRoots.get( name );
	}

	/**
	 * Renders all changes. In order to avoid triggering the observers (e.g. mutations) all observers all detached
	 * before rendering and reattached after that.
	 */
	render() {
		for ( let observer of this._observers.values() ) {
			observer.disable();
		}

		this.renderer.render();

		for ( let observer of this._observers.values() ) {
			observer.enable();
		}
	}
}

mix( Document, EmitterMixin );

/**
 * Enum representing type of the change.
 *
 * Possible values:
 *
 * * `CHILDREN` - for child list changes,
 * * `ATTRIBUTES` - for element attributes changes,
 * * `TEXT` - for text nodes changes.
 *
 * @typedef {String} engine.view.ChangeType
 */
