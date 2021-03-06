#
#=BEGIN SONGBIRD GPL
#
# This file is part of the Songbird web player.
#
# Copyright(c) 2005-2009 POTI, Inc.
# http://www.songbirdnest.com
#
# This file may be licensed under the terms of of the
# GNU General Public License Version 2 (the ``GPL'').
#
# Software distributed under the License is distributed
# on an ``AS IS'' basis, WITHOUT WARRANTY OF ANY KIND, either
# express or implied. See the GPL for the specific language
# governing rights and limitations.
#
# You should have received a copy of the GPL along with this
# program. If not, go to http://www.gnu.org/licenses/gpl.html
# or write to the Free Software Foundation, Inc.,
# 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.
#
#=END SONGBIRD GPL
#

# the name of the extension - used to name the XPI file.
EXTENSION_NAME = songbird-systray
# the uuid of the extension - used internally by songbird to identify the
# extension.
EXTENSION_UUID = $(EXTENSION_NAME)@extensions.mook.moz.googlepages.com
# where is the extension we're building (right here)
EXTENSION_DIR  = .

EXTENSION_VER = 0.0.1a
EXTENSION_MIN_VER = $(SB_MILESTONE)
EXTENSION_MAX_VER = $(SB_MILESTONE)
