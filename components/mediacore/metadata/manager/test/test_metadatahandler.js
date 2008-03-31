/*
//
// BEGIN SONGBIRD GPL
//
// This file is part of the Songbird web player.
//
// Copyright(c) 2005-2008 POTI, Inc.
// http://songbirdnest.com
//
// This file may be licensed under the terms of of the
// GNU General Public License Version 2 (the "GPL").
//
// Software distributed under the License is distributed
// on an "AS IS" basis, WITHOUT WARRANTY OF ANY KIND, either
// express or implied. See the GPL for the specific language
// governing rights and limitations.
//
// You should have received a copy of the GPL along with this
// program. If not, go to http://www.gnu.org/licenses/gpl.html
// or write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
//
// END SONGBIRD GPL
//
*/

/**
 * \brief Test reading and writing with an sbIMetadataHandler
 */

var gMetadataManager;

function runTest () {
  gMetadataManager = Components.classes["@songbirdnest.com/Songbird/MetadataManager;1"]
                                .getService(Components.interfaces.sbIMetadataManager);
                              
  var file = newFileURI(newAppRelativeFile("testharness/metadatamanager/handlerTest.mp3"));
  var handler = gMetadataManager.getHandlerForMediaURL(file.spec);
  
  assertNotEqual(handler, null);
  
  // NOTE: Does not accommodate async reading
  var itemsRead = handler.read();
  // Make sure we got at least a couple properties
  assertEqual(itemsRead > 5, true);
  assertEqual(handler.completed, true);
  
  // Verify that initially all properties are X
  var expectedProperties = {};
  expectedProperties[SBProperties.artistName] = "X";
  expectedProperties[SBProperties.albumName] = "X";
  expectedProperties[SBProperties.trackName] = "X";
  
  assertObjectIsSubsetOf(expectedProperties, SBProperties.arrayToJSObject(handler.props));
  
  
  // Write out new values
  handler.props.clear();
  var newProperties = {};
  newProperties[SBProperties.artistName] = "New Artist";
  newProperties[SBProperties.albumName] = "New Album";
  newProperties[SBProperties.tracKName] = "New Track";
  SBProperties.addToArray(newProperties, handler.props);
  
  // TODO Write this to disk
  //handler.write();
  
  // TODO Get a new handler just to make sure it isn't cheating somehow
  //handler.close();
  //handler = gMetadataManager.getHandlerForMediaURL(file.spec);
    
  // Confirm that writing succeeded.
  assertObjectIsSubsetOf(newProperties, SBProperties.arrayToJSObject(handler.props));  
  
  handler.close();
}
